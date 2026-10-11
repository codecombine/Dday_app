import { classifyPair, type DedupeCandidate, type DedupeGroup, DEFAULT_THRESHOLDS } from '@hanjibung/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { P } from '../src/repo/docstore';
import {
  candidatePairs,
  dismissDedupe,
  forgetPhotos,
  reconcileGroups,
  scanSpace,
  updateDedupeForPhoto,
} from '../src/services/dedupe';
import { trashPhoto } from '../src/services/photos';
import { type Harness, makeHarness, phashWithFlips, seedDevice, seedPhoto, seedSpace, seedUser } from './fakes/harness';

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

describe('후보 쌍 (pHash 조각)', () => {
  it('같은 파일·화질 낮은 사본은 하나도 놓치지 않고, 관계없는 쌍은 내지 않는다', () => {
    const rand = rng(7);
    const hex = () => Array.from({ length: 16 }, () => Math.floor(rand() * 16).toString(16)).join('');
    const photos: DedupeCandidate[] = [];
    for (let i = 0; i < 60; i++) {
      const base = hex();
      photos.push({ id: `b${i}`, sha256: `s${i}`, phash: base, width: 4000, height: 3000, bytes: 3e6, hasExif: true, takenAt: null, source: 'camera', createdAt: i });
      // 사본: 1~7비트 바꾸고 해상도 낮춤
      const flips = Array.from({ length: 1 + (i % 7) }, () => Math.floor(rand() * 64));
      photos.push({ id: `c${i}`, sha256: `t${i}`, phash: phashWithFlips(base, flips), width: 1600, height: 1200, bytes: 4e5, hasExif: false, takenAt: null, source: 'kakao', createdAt: 100 + i });
      if (i % 5 === 0) photos.push({ id: `e${i}`, sha256: `s${i}`, phash: base, width: 4000, height: 3000, bytes: 3e6, hasExif: true, takenAt: null, source: 'camera', createdAt: 200 + i });
    }
    const found = new Set(candidatePairs(photos, DEFAULT_THRESHOLDS).map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
    let strong = 0;
    for (let i = 0; i < photos.length; i++) {
      for (let j = i + 1; j < photos.length; j++) {
        const k = classifyPair(photos[i]!, photos[j]!);
        if (k === 'exact' || k === 'copy') {
          strong++;
          expect(found.has(`${i}-${j}`), `${photos[i]!.id}-${photos[j]!.id}`).toBe(true);
        }
        if (!k) expect(found.has(`${i}-${j}`)).toBe(false);
      }
    }
    expect(strong).toBeGreaterThan(60);
  });

  it('빈 목록', () => {
    expect(candidatePairs([], DEFAULT_THRESHOLDS)).toEqual([]);
  });
});

describe('묶음 맞추기 (reconcileGroups)', () => {
  const g = (id: string, photoIds: string[], over: Partial<DedupeGroup> = {}): DedupeGroup => ({
    id,
    spaceId: 's',
    kind: 'copy',
    photoIds,
    keepPhotoId: photoIds[0]!,
    status: 'open',
    updatedAt: 0,
    ...over,
  });
  let n = 0;
  const ctx = { spaceId: 's', now: 5, newId: () => `new${++n}` };

  it('사진이 겹치는 기존 묶음 ID를 다시 쓰고, 그대로면 쓰지 않는다', () => {
    const plan = reconcileGroups(
      [g('g1', ['a', 'b']), g('g2', ['x', 'y'])],
      [
        { kind: 'copy', photoIds: ['a', 'b', 'c'], keepPhotoId: 'a', suggestedRemoveIds: ['b', 'c'] },
        { kind: 'copy', photoIds: ['x', 'y'], keepPhotoId: 'x', suggestedRemoveIds: ['y'] },
      ],
      [],
      ctx,
    );
    expect(plan.upserts).toEqual([{ id: 'g1', spaceId: 's', kind: 'copy', photoIds: ['a', 'b', 'c'], keepPhotoId: 'a', status: 'open', updatedAt: 5 }]);
    expect(plan.deletes).toEqual([]);
    expect(plan.created).toEqual([]);
    expect(plan.total).toBe(2);
  });

  it('두 묶음이 하나로 합쳐지면 하나는 지운다, 새 묶음은 새 ID', () => {
    const plan = reconcileGroups(
      [g('g1', ['a', 'b']), g('g2', ['c', 'd'])],
      [
        { kind: 'copy', photoIds: ['a', 'b', 'c', 'd'], keepPhotoId: 'a', suggestedRemoveIds: [] },
        { kind: 'similar', photoIds: ['m', 'n'], keepPhotoId: 'm', suggestedRemoveIds: [] },
      ],
      [],
      ctx,
    );
    expect(plan.upserts.map((u) => u.id).sort()).toEqual(['g1', 'new1'].sort());
    expect(plan.deletes).toEqual(['g2']);
    expect(plan.created.map((c) => c.photoIds)).toEqual([['m', 'n']]);
  });

  it('무시·정리한 묶음의 부분집합은 다시 열지 않는다', () => {
    const plan = reconcileGroups([], [{ kind: 'exact', photoIds: ['a', 'b'], keepPhotoId: 'a', suggestedRemoveIds: ['b'] }], [['a', 'b', 'c']], ctx);
    expect(plan.upserts).toEqual([]);
    expect(plan.total).toBe(0);
  });
});

describe('사진이 올라올 때마다 묶음 갱신', () => {
  let h: Harness;
  const BASE = '8f3a5c7e91b2d4f6';

  beforeEach(() => {
    h = makeHarness();
    seedUser(h, 'mom', ['home']);
    seedUser(h, 'dad', ['home']);
    seedSpace(h, 'home', ['mom'], ['mom', 'dad']);
    seedSpace(h, 'other', ['dad'], ['dad']);
    seedDevice(h, 'mom', 'mom-phone');
  });

  const openGroups = () => h.docs.list<DedupeGroup>('dedupeGroups').filter((g) => g.status === 'open');

  it('사본 → 같은 파일 → 관계없는 사진 → 비슷한 사진', async () => {
    await seedPhoto(h, { id: 'orig', ownerUid: 'mom', spaceIds: ['home'], phash: BASE });
    await seedPhoto(h, {
      id: 'kakao',
      ownerUid: 'dad',
      spaceIds: ['home'],
      phash: phashWithFlips(BASE, [3, 40]),
      width: 1280,
      height: 960,
      hasExif: false,
      source: 'kakao',
    });
    await updateDedupeForPhoto(h.deps, 'kakao');
    let groups = openGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ spaceId: 'home', kind: 'copy', keepPhotoId: 'orig' });
    expect(groups[0]!.photoIds.sort()).toEqual(['kakao', 'orig']);
    const firstId = groups[0]!._id;
    // 관리자(엄마)에게 검토 알림
    expect(h.push.sent).toHaveLength(1);
    expect(h.push.sent[0]!.msg.data).toMatchObject({ type: 'dedupe', spaceId: 'home', toUid: 'mom' });

    // 같은 파일이 또 올라옴 → 같은 묶음(ID 유지)에 들어간다
    await seedPhoto(h, { id: 'exact', ownerUid: 'dad', spaceIds: ['home'], phash: BASE, sha256: 'orig'.padEnd(64, '0') });
    await updateDedupeForPhoto(h.deps, 'exact');
    groups = openGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0]!._id).toBe(firstId);
    expect(groups[0]!.photoIds.sort()).toEqual(['exact', 'kakao', 'orig']);
    expect(h.push.sent).toHaveLength(1); // 6시간 안에는 다시 알리지 않는다

    // 관계없는 사진
    await seedPhoto(h, { id: 'cat', ownerUid: 'mom', spaceIds: ['home'], phash: '0123456789abcdef' });
    await updateDedupeForPhoto(h.deps, 'cat');
    expect(openGroups()).toHaveLength(1);

    // 다른 공간의 같은 사진은 그 공간에서 따로 본다
    await seedPhoto(h, { id: 'elsewhere', ownerUid: 'dad', spaceIds: ['other'], phash: BASE });
    await updateDedupeForPhoto(h.deps, 'elsewhere');
    expect(openGroups()).toHaveLength(1);
  });

  it('비슷한 사진(연사)은 제안 묶음, 무시하면 다시 열리지 않는다', async () => {
    await seedPhoto(h, { id: 'a', ownerUid: 'mom', spaceIds: ['home'], phash: BASE });
    await seedPhoto(h, { id: 'b', ownerUid: 'mom', spaceIds: ['home'], phash: phashWithFlips(BASE, [0, 1, 8, 9, 16, 17, 24, 25]) });
    await updateDedupeForPhoto(h.deps, 'b');
    const [g] = openGroups();
    expect(g).toMatchObject({ kind: 'similar' });
    expect(h.push.sent).toHaveLength(0); // 비슷한 사진은 알림 없음

    await dismissDedupe(h.deps, 'mom', g!._id);
    await updateDedupeForPhoto(h.deps, 'b');
    expect(openGroups()).toHaveLength(0);
    // 관리자가 아니면 무시할 수 없다
    await expect(dismissDedupe(h.deps, 'dad', g!._id)).rejects.toMatchObject({ status: 403 });
  });

  it('휴지통으로 가면 묶음에서 빠지고, 2장 미만이면 묶음이 없어진다', async () => {
    await seedPhoto(h, { id: 'a', ownerUid: 'mom', spaceIds: ['home'], phash: BASE });
    await seedPhoto(h, { id: 'b', ownerUid: 'mom', spaceIds: ['home'], phash: BASE, sha256: 'a'.padEnd(64, '0') });
    await seedPhoto(h, { id: 'c', ownerUid: 'mom', spaceIds: ['home'], phash: BASE, sha256: 'a'.padEnd(64, '0') });
    await updateDedupeForPhoto(h.deps, 'b');
    await updateDedupeForPhoto(h.deps, 'c');
    expect(openGroups()[0]!.photoIds).toHaveLength(3);
    await trashPhoto(h.deps, 'mom', 'c');
    expect(openGroups()[0]!.photoIds.sort()).toEqual(['a', 'b']);
    await trashPhoto(h.deps, 'mom', 'b');
    expect(openGroups()).toHaveLength(0);
  });

  it('다시 검사: 전체 계산 결과가 증분 결과와 같고 ID를 유지한다', async () => {
    await seedPhoto(h, { id: 'a', ownerUid: 'mom', spaceIds: ['home'], phash: BASE });
    await seedPhoto(h, { id: 'b', ownerUid: 'dad', spaceIds: ['home'], phash: phashWithFlips(BASE, [5]), width: 800, height: 600 });
    await seedPhoto(h, { id: 'x', ownerUid: 'dad', spaceIds: ['home'], phash: 'fedcba9876543210' });
    await seedPhoto(h, { id: 'y', ownerUid: 'dad', spaceIds: ['home'], phash: 'fedcba9876543210', sha256: 'x'.padEnd(64, '0') });
    await updateDedupeForPhoto(h.deps, 'b');
    const before = openGroups().map((g) => g._id);
    expect(before).toHaveLength(1);
    expect(await scanSpace(h.deps, 'mom', 'home')).toBe(2);
    const after = openGroups();
    expect(after.map((g) => g._id)).toContain(before[0]);
    expect(after.find((g) => g.photoIds.includes('x'))).toMatchObject({ kind: 'exact' });
    await expect(scanSpace(h.deps, 'dad', 'home')).rejects.toMatchObject({ status: 403 });
  });

  it('공간에서 빠진 사진은 그 공간 묶음에서만 빠진다', async () => {
    await seedPhoto(h, { id: 'a', ownerUid: 'mom', spaceIds: ['home'], phash: BASE });
    await seedPhoto(h, { id: 'b', ownerUid: 'mom', spaceIds: ['home'], phash: BASE, sha256: 'a'.padEnd(64, '0') });
    await updateDedupeForPhoto(h.deps, 'b');
    await forgetPhotos(h.deps, ['b'], ['other']);
    expect(openGroups()).toHaveLength(1);
    await forgetPhotos(h.deps, ['b'], ['home']);
    expect(openGroups()).toHaveLength(0);
    expect(h.docs.data(P.photo('b'))).toBeDefined();
  });
});
