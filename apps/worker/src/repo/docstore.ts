// Firestore 접근 계층 (얇은 저장소 인터페이스). 운영은 REST 구현, 테스트는 메모리 구현을 쓴다.

export type FilterOp =
  | 'EQUAL'
  | 'NOT_EQUAL'
  | 'LESS_THAN'
  | 'LESS_THAN_OR_EQUAL'
  | 'GREATER_THAN'
  | 'GREATER_THAN_OR_EQUAL'
  | 'ARRAY_CONTAINS'
  | 'ARRAY_CONTAINS_ANY'
  | 'IN'
  | 'NOT_IN';

export interface Filter {
  field: string;
  op: FilterOp;
  value: unknown;
}

export interface Query {
  /** AND로 묶인다 */
  where?: Filter[];
  orderBy?: { field: string; direction?: 'ASCENDING' | 'DESCENDING' }[];
  limit?: number;
}

export interface Doc<T> {
  id: string;
  /** 'items/abc' 같은 상대 경로 */
  path: string;
  data: T;
}

export type Write =
  /** 문서 전체를 덮어쓴다. mustNotExist면 새로 만들 때만 */
  | { op: 'set'; path: string; data: Record<string, unknown>; mustNotExist?: boolean }
  /** 최상위 필드만 바꾼다. 문서가 있어야 한다 */
  | { op: 'update'; path: string; data: Record<string, unknown> }
  | { op: 'delete'; path: string }
  /** 배열에 없는 값만 추가 / 값 모두 제거. 문서가 있어야 한다 */
  | { op: 'arrayUnion'; path: string; field: string; values: unknown[] }
  | { op: 'arrayRemove'; path: string; field: string; values: unknown[] };

export interface DocStore {
  get<T>(path: string): Promise<T | null>;
  getMany<T>(paths: readonly string[]): Promise<Map<string, T>>;
  /** collectionPath: 'items', 'spaces/abc/members' … */
  query<T>(collectionPath: string, q?: Query): Promise<Doc<T>[]>;
  count(collectionPath: string, where?: Filter[]): Promise<number>;
  /** 원자적으로 적용한다 (500개를 넘으면 나눠서, 묶음 사이는 원자적이지 않음) */
  commit(writes: readonly Write[]): Promise<void>;
}

export class DocStoreError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = 'DocStoreError';
  }
}

/** Firestore의 array-contains-any / in 은 값 30개까지 */
export const MAX_DISJUNCTION = 30;

export function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** 값이 많을 때 array-contains-any 쿼리를 나눠서 실행하고 ID로 합친다 */
export async function queryContainsAny<T>(
  docs: DocStore,
  collection: string,
  field: string,
  values: readonly string[],
  extra: Filter[] = [],
): Promise<Doc<T>[]> {
  const seen = new Map<string, Doc<T>>();
  for (const part of chunk([...new Set(values)], MAX_DISJUNCTION)) {
    const rows = await docs.query<T>(collection, { where: [{ field, op: 'ARRAY_CONTAINS_ANY', value: part }, ...extra] });
    for (const r of rows) seen.set(r.id, r);
  }
  return [...seen.values()];
}

// 문서 경로
export const P = {
  user: (uid: string) => `users/${uid}`,
  devices: (uid: string) => `users/${uid}/devices`,
  device: (uid: string, deviceId: string) => `users/${uid}/devices/${deviceId}`,
  space: (id: string) => `spaces/${id}`,
  members: (spaceId: string) => `spaces/${spaceId}/members`,
  member: (spaceId: string, memberId: string) => `spaces/${spaceId}/members/${memberId}`,
  item: (id: string) => `items/${id}`,
  photo: (id: string) => `photos/${id}`,
  album: (id: string) => `albums/${id}`,
  group: (id: string) => `dedupeGroups/${id}`,
  mergeRequest: (id: string) => `mergeRequests/${id}`,
};
