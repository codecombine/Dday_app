// Firestore REST v1 클라이언트 (DocStore 구현)
import { chunk, type Doc, type DocStore, DocStoreError, type Filter, type Query, type Write } from '../repo/docstore';
import { decodeFields, encodeFields, encodeValue, type FsFields, quoteFieldPath } from './firestore-values';
import { type Fetcher, GoogleApiError, parseGoogleError } from './http';

interface FsDocument {
  name: string;
  fields?: FsFields;
}

const API = 'https://firestore.googleapis.com/v1';

export class FirestoreClient implements DocStore {
  private readonly root: string;

  constructor(
    projectId: string,
    private readonly token: () => Promise<string>,
    private readonly fetcher: Fetcher,
  ) {
    this.root = `projects/${projectId}/databases/(default)/documents`;
  }

  private name(path: string): string {
    return `${this.root}/${path}`;
  }

  private idOf(name: string): string {
    return name.slice(name.lastIndexOf('/') + 1);
  }

  private relPath(name: string): string {
    return name.slice(this.root.length + 1);
  }

  private async call<T>(method: string, url: string, body?: unknown, allow404 = false): Promise<T | null> {
    const res = await this.fetcher(url, {
      method,
      headers: {
        Authorization: `Bearer ${await this.token()}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (allow404 && res.status === 404) return null;
    if (!res.ok) {
      const e: GoogleApiError = await parseGoogleError(res);
      throw new DocStoreError(e.status, e.reason, `Firestore ${method} 실패: ${e.message}`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  async get<T>(path: string): Promise<T | null> {
    const doc = await this.call<FsDocument>('GET', `${API}/${this.name(path)}`, undefined, true);
    return doc ? (decodeFields(doc.fields) as T) : null;
  }

  async getMany<T>(paths: readonly string[]): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    for (const part of chunk([...new Set(paths)], 100)) {
      if (!part.length) continue;
      const res = await this.call<{ found?: FsDocument; missing?: string }[]>('POST', `${API}/${this.root}:batchGet`, {
        documents: part.map((p) => this.name(p)),
      });
      for (const r of res ?? []) {
        if (r.found) out.set(this.relPath(r.found.name), decodeFields(r.found.fields) as T);
      }
    }
    return out;
  }

  private splitCollection(collectionPath: string): { parent: string; collectionId: string } {
    const i = collectionPath.lastIndexOf('/');
    if (i < 0) return { parent: this.root, collectionId: collectionPath };
    return { parent: `${this.root}/${collectionPath.slice(0, i)}`, collectionId: collectionPath.slice(i + 1) };
  }

  private encodeWhere(where: readonly Filter[] | undefined): unknown {
    if (!where || where.length === 0) return undefined;
    const filters = where.map((f) => ({
      fieldFilter: { field: { fieldPath: quoteFieldPath(f.field) }, op: f.op, value: encodeValue(f.value) },
    }));
    return filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } };
  }

  private structuredQuery(collectionId: string, q: Query): Record<string, unknown> {
    const sq: Record<string, unknown> = { from: [{ collectionId }] };
    const where = this.encodeWhere(q.where);
    if (where) sq.where = where;
    if (q.orderBy?.length) {
      sq.orderBy = q.orderBy.map((o) => ({ field: { fieldPath: quoteFieldPath(o.field) }, direction: o.direction ?? 'ASCENDING' }));
    }
    if (q.limit) sq.limit = q.limit;
    return sq;
  }

  async query<T>(collectionPath: string, q: Query = {}): Promise<Doc<T>[]> {
    const { parent, collectionId } = this.splitCollection(collectionPath);
    const res = await this.call<{ document?: FsDocument }[]>('POST', `${API}/${parent}:runQuery`, {
      structuredQuery: this.structuredQuery(collectionId, q),
    });
    const out: Doc<T>[] = [];
    for (const r of res ?? []) {
      if (!r.document) continue;
      out.push({ id: this.idOf(r.document.name), path: this.relPath(r.document.name), data: decodeFields(r.document.fields) as T });
    }
    return out;
  }

  async count(collectionPath: string, where?: Filter[]): Promise<number> {
    const { parent, collectionId } = this.splitCollection(collectionPath);
    const res = await this.call<{ result?: { aggregateFields?: Record<string, { integerValue?: string }> } }[]>(
      'POST',
      `${API}/${parent}:runAggregationQuery`,
      {
        structuredAggregationQuery: {
          structuredQuery: this.structuredQuery(collectionId, { where }),
          aggregations: [{ alias: 'n', count: {} }],
        },
      },
    );
    const v = res?.[0]?.result?.aggregateFields?.n?.integerValue;
    return v ? Number(v) : 0;
  }

  encodeWrite(w: Write): Record<string, unknown> {
    const name = this.name(w.path);
    switch (w.op) {
      case 'set':
        return {
          update: { name, fields: encodeFields(w.data) },
          ...(w.mustNotExist ? { currentDocument: { exists: false } } : {}),
        };
      case 'update':
        return {
          update: { name, fields: encodeFields(w.data) },
          updateMask: { fieldPaths: Object.keys(w.data).map(quoteFieldPath) },
          currentDocument: { exists: true },
        };
      case 'delete':
        return { delete: name };
      case 'arrayUnion':
      case 'arrayRemove':
        return {
          update: { name, fields: {} },
          updateMask: { fieldPaths: [] },
          updateTransforms: [
            {
              fieldPath: quoteFieldPath(w.field),
              [w.op === 'arrayUnion' ? 'appendMissingElements' : 'removeAllFromArray']: {
                values: w.values.map((v) => encodeValue(v)),
              },
            },
          ],
          currentDocument: { exists: true },
        };
    }
  }

  async commit(writes: readonly Write[]): Promise<void> {
    for (const part of chunk(writes, 450)) {
      if (!part.length) continue;
      await this.call('POST', `${API}/${this.root}:commit`, { writes: part.map((w) => this.encodeWrite(w)) });
    }
  }
}

export function isAlreadyExists(e: unknown): boolean {
  return e instanceof DocStoreError && (e.reason === 'ALREADY_EXISTS' || e.status === 409);
}

export function isNotFound(e: unknown): boolean {
  return e instanceof DocStoreError && (e.reason === 'NOT_FOUND' || e.status === 404);
}

export { GoogleApiError };
