// 메모리 Firestore (DocStore 가짜). commit은 전부 적용되거나 하나도 적용되지 않는다.
import { type Doc, type DocStore, DocStoreError, type Filter, type Query, type Write } from '../../src/repo/docstore';

type Data = Record<string, unknown>;

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function field(data: Data, path: string): unknown {
  let cur: unknown = data;
  for (const seg of path.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Data)[seg];
  }
  return cur;
}

function cmp(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function matches(data: Data, f: Filter): boolean {
  const v = field(data, f.field);
  const list = Array.isArray(f.value) ? f.value : [];
  switch (f.op) {
    case 'EQUAL':
      return eq(v, f.value);
    case 'NOT_EQUAL':
      return v !== undefined && !eq(v, f.value);
    case 'LESS_THAN':
      return v !== undefined && v !== null && cmp(v, f.value) < 0;
    case 'LESS_THAN_OR_EQUAL':
      return v !== undefined && v !== null && cmp(v, f.value) <= 0;
    case 'GREATER_THAN':
      return v !== undefined && v !== null && cmp(v, f.value) > 0;
    case 'GREATER_THAN_OR_EQUAL':
      return v !== undefined && v !== null && cmp(v, f.value) >= 0;
    case 'ARRAY_CONTAINS':
      return Array.isArray(v) && v.some((x) => eq(x, f.value));
    case 'ARRAY_CONTAINS_ANY':
      if (list.length > 30) throw new DocStoreError(400, 'INVALID_ARGUMENT', 'array-contains-any는 30개까지');
      return Array.isArray(v) && v.some((x) => list.some((y) => eq(x, y)));
    case 'IN':
      return list.some((y) => eq(v, y));
    case 'NOT_IN':
      return v !== undefined && !list.some((y) => eq(v, y));
  }
}

export class MemoryDocStore implements DocStore {
  docs = new Map<string, Data>();
  commitCount = 0;

  /** 시험 준비용: 바로 넣기 */
  seed(path: string, data: Data): void {
    this.docs.set(path, clone(data));
  }

  data<T = Data>(path: string): T | undefined {
    const d = this.docs.get(path);
    return d ? (clone(d) as T) : undefined;
  }

  list<T = Data>(collection: string): (T & { _id: string })[] {
    const depth = collection.split('/').length + 1;
    return [...this.docs.entries()]
      .filter(([p]) => p.startsWith(`${collection}/`) && p.split('/').length === depth)
      .map(([p, d]) => ({ ...(clone(d) as T), _id: p.slice(p.lastIndexOf('/') + 1) }));
  }

  async get<T>(path: string): Promise<T | null> {
    const d = this.docs.get(path);
    return d ? (clone(d) as T) : null;
  }

  async getMany<T>(paths: readonly string[]): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    for (const p of paths) {
      const d = this.docs.get(p);
      if (d) out.set(p, clone(d) as T);
    }
    return out;
  }

  async query<T>(collectionPath: string, q: Query = {}): Promise<Doc<T>[]> {
    const depth = collectionPath.split('/').length + 1;
    let rows = [...this.docs.entries()].filter(
      ([p]) => p.startsWith(`${collectionPath}/`) && p.split('/').length === depth,
    );
    for (const f of q.where ?? []) rows = rows.filter(([, d]) => matches(d, f));
    for (const o of [...(q.orderBy ?? [])].reverse()) {
      rows = rows.filter(([, d]) => field(d, o.field) !== undefined);
      rows.sort(([, a], [, b]) => cmp(field(a, o.field), field(b, o.field)) * (o.direction === 'DESCENDING' ? -1 : 1));
    }
    if (q.limit) rows = rows.slice(0, q.limit);
    return rows.map(([p, d]) => ({ id: p.slice(p.lastIndexOf('/') + 1), path: p, data: clone(d) as T }));
  }

  async count(collectionPath: string, where?: Filter[]): Promise<number> {
    return (await this.query(collectionPath, { where })).length;
  }

  async commit(writes: readonly Write[]): Promise<void> {
    const next = new Map(this.docs);
    for (const w of writes) {
      const cur = next.get(w.path);
      switch (w.op) {
        case 'set':
          if (w.mustNotExist && cur) throw new DocStoreError(409, 'ALREADY_EXISTS', `${w.path} 이미 있음`);
          next.set(w.path, clone(w.data));
          break;
        case 'update': {
          if (!cur) throw new DocStoreError(404, 'NOT_FOUND', `${w.path} 없음`);
          const merged = { ...cur };
          for (const [k, v] of Object.entries(w.data)) if (v !== undefined) merged[k] = clone(v);
          next.set(w.path, merged);
          break;
        }
        case 'delete':
          next.delete(w.path);
          break;
        case 'arrayUnion':
        case 'arrayRemove': {
          if (!cur) throw new DocStoreError(404, 'NOT_FOUND', `${w.path} 없음`);
          const arr = Array.isArray(cur[w.field]) ? [...(cur[w.field] as unknown[])] : [];
          const out =
            w.op === 'arrayUnion'
              ? [...arr, ...w.values.filter((v, i) => !arr.some((x) => eq(x, v)) && w.values.findIndex((y) => eq(y, v)) === i)]
              : arr.filter((x) => !w.values.some((v) => eq(x, v)));
          next.set(w.path, { ...cur, [w.field]: clone(out) });
          break;
        }
      }
    }
    this.docs = next;
    this.commitCount++;
  }
}
