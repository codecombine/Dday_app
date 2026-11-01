import { describe, expect, it } from 'vitest';

import { FirestoreClient } from '../src/google/firestore';
import { decodeFields, decodeValue, encodeFields, encodeValue, quoteFieldPath } from '../src/google/firestore-values';
import { DocStoreError } from '../src/repo/docstore';

describe('Firestore 값 인코딩', () => {
  it('왕복 변환이 같은 값을 돌려준다', () => {
    const doc = {
      title: '옥수집 저녁',
      count: 3,
      ratio: 1.5,
      negative: -42,
      zero: 0,
      big: 1_760_000_000_000,
      ok: true,
      no: false,
      nothing: null,
      empty: [],
      tags: ['a', 'b'],
      nested: [[1, 2], [{ x: 'y' }]],
      map: { inner: { deep: 'v', n: 2.25 }, list: [null, true] },
      emptyMap: {},
      korean: '한지붕 😀',
    };
    const enc = encodeFields(doc);
    expect(decodeFields(enc)).toEqual(doc);
  });

  it('정수는 integerValue(문자열), 소수는 doubleValue', () => {
    expect(encodeValue(5)).toEqual({ integerValue: '5' });
    expect(encodeValue(1_760_000_000_000)).toEqual({ integerValue: '1760000000000' });
    expect(encodeValue(0.5)).toEqual({ doubleValue: 0.5 });
    expect(encodeValue(Number.NaN)).toEqual({ doubleValue: 'NaN' });
    expect(encodeValue(null)).toEqual({ nullValue: null });
    expect(encodeValue([])).toEqual({ arrayValue: {} });
    expect(encodeValue({})).toEqual({ mapValue: {} });
  });

  it('undefined 필드는 건너뛰고, 배열 안의 undefined는 null', () => {
    expect(encodeFields({ a: undefined, b: 1 })).toEqual({ b: { integerValue: '1' } });
    expect(encodeValue([undefined])).toEqual({ arrayValue: { values: [{ nullValue: null }] } });
  });

  it('Firestore가 주는 다른 형식도 읽는다', () => {
    expect(decodeValue({ timestampValue: '2026-10-10T03:00:00Z' })).toBe(Date.UTC(2026, 9, 10, 3));
    expect(decodeValue({ doubleValue: 2 })).toBe(2);
    expect(decodeValue({ arrayValue: {} })).toEqual([]);
    expect(decodeValue({ mapValue: {} })).toEqual({});
    expect(decodeFields(undefined)).toEqual({});
  });

  it('필드 경로 따옴표', () => {
    expect(quoteFieldPath('spaceIds')).toBe('spaceIds');
    expect(quoteFieldPath('settings.notify')).toBe('settings.notify');
    expect(quoteFieldPath('a-b')).toBe('`a-b`');
  });
});

describe('Firestore REST 클라이언트', () => {
  function client(responses: (url: string, init: RequestInit) => Response) {
    const calls: { url: string; init: RequestInit }[] = [];
    const c = new FirestoreClient('proj', async () => 'tok', async (url, init) => {
      calls.push({ url, init: init ?? {} });
      return responses(url, init ?? {});
    });
    return { c, calls };
  }
  const root = 'https://firestore.googleapis.com/v1/projects/proj/databases/(default)/documents';

  it('get: 없으면 null, 있으면 디코딩', async () => {
    const { c, calls } = client((url) =>
      url.endsWith('/users/a')
        ? Response.json({ name: 'x', fields: { displayName: { stringValue: '엄마' }, spaceIds: { arrayValue: {} } } })
        : Response.json({ error: { code: 404, status: 'NOT_FOUND', message: 'no' } }, { status: 404 }),
    );
    expect(await c.get('users/a')).toEqual({ displayName: '엄마', spaceIds: [] });
    expect(await c.get('users/b')).toBeNull();
    expect(calls[0]!.url).toBe(`${root}/users/a`);
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('runQuery: 구조화 쿼리와 하위 컬렉션 parent', async () => {
    const { c, calls } = client(() =>
      Response.json([
        { document: { name: 'projects/proj/databases/(default)/documents/spaces/s1/members/m1', fields: { role: { stringValue: 'admin' } } } },
        { readTime: 'x' },
      ]),
    );
    const rows = await c.query('spaces/s1/members', {
      where: [
        { field: 'uid', op: 'EQUAL', value: 'u1' },
        { field: 'tags', op: 'ARRAY_CONTAINS_ANY', value: ['a', 'b'] },
      ],
      orderBy: [{ field: 'joinedAt', direction: 'DESCENDING' }],
      limit: 5,
    });
    expect(rows).toEqual([{ id: 'm1', path: 'spaces/s1/members/m1', data: { role: 'admin' } }]);
    expect(calls[0]!.url).toBe(`${root}/spaces/s1:runQuery`);
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.structuredQuery).toEqual({
      from: [{ collectionId: 'members' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: 'u1' } } },
            {
              fieldFilter: {
                field: { fieldPath: 'tags' },
                op: 'ARRAY_CONTAINS_ANY',
                value: { arrayValue: { values: [{ stringValue: 'a' }, { stringValue: 'b' }] } },
              },
            },
          ],
        },
      },
      orderBy: [{ field: { fieldPath: 'joinedAt' }, direction: 'DESCENDING' }],
      limit: 5,
    });
  });

  it('count: 집계 쿼리', async () => {
    const { c, calls } = client(() => Response.json([{ result: { aggregateFields: { n: { integerValue: '7' } } } }]));
    expect(await c.count('items', [{ field: 'spaceIds', op: 'ARRAY_CONTAINS', value: 's1' }])).toBe(7);
    expect(calls[0]!.url).toBe(`${root}:runAggregationQuery`);
  });

  it('commit: 쓰기 종류별 인코딩', async () => {
    const { c, calls } = client(() => Response.json({ writeResults: [] }));
    await c.commit([
      { op: 'set', path: 'spaces/s1', data: { name: '약수집' }, mustNotExist: true },
      { op: 'update', path: 'photos/p1', data: { status: 'active', spaceIds: ['s1'] } },
      { op: 'arrayUnion', path: 'users/u1', field: 'spaceIds', values: ['s1'] },
      { op: 'arrayRemove', path: 'spaces/s1', field: 'adminUids', values: ['u2'] },
      { op: 'delete', path: 'items/i1' },
    ]);
    expect(calls[0]!.url).toBe(`${root}:commit`);
    const name = (p: string) => `projects/proj/databases/(default)/documents/${p}`;
    expect(JSON.parse(String(calls[0]!.init.body)).writes).toEqual([
      { update: { name: name('spaces/s1'), fields: { name: { stringValue: '약수집' } } }, currentDocument: { exists: false } },
      {
        update: { name: name('photos/p1'), fields: { status: { stringValue: 'active' }, spaceIds: { arrayValue: { values: [{ stringValue: 's1' }] } } } },
        updateMask: { fieldPaths: ['status', 'spaceIds'] },
        currentDocument: { exists: true },
      },
      {
        update: { name: name('users/u1'), fields: {} },
        updateMask: { fieldPaths: [] },
        updateTransforms: [{ fieldPath: 'spaceIds', appendMissingElements: { values: [{ stringValue: 's1' }] } }],
        currentDocument: { exists: true },
      },
      {
        update: { name: name('spaces/s1'), fields: {} },
        updateMask: { fieldPaths: [] },
        updateTransforms: [{ fieldPath: 'adminUids', removeAllFromArray: { values: [{ stringValue: 'u2' }] } }],
        currentDocument: { exists: true },
      },
      { delete: name('items/i1') },
    ]);
  });

  it('오류는 DocStoreError로 (상태 포함)', async () => {
    const { c } = client(() => Response.json({ error: { code: 409, status: 'ALREADY_EXISTS', message: 'exists' } }, { status: 409 }));
    const err = await c.commit([{ op: 'delete', path: 'x/y' }]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DocStoreError);
    expect((err as DocStoreError).reason).toBe('ALREADY_EXISTS');
  });

  it('batchGet: 찾은 문서만', async () => {
    const { c } = client(() =>
      Response.json([
        { found: { name: 'projects/proj/databases/(default)/documents/users/a', fields: { n: { integerValue: '1' } } } },
        { missing: 'projects/proj/databases/(default)/documents/users/b' },
      ]),
    );
    const m = await c.getMany(['users/a', 'users/b']);
    expect([...m.entries()]).toEqual([['users/a', { n: 1 }]]);
  });
});
