import type { DedupeGroup, Photo } from '@hanjibung/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { P } from '../src/repo/docstore';
import { applyDedupe, approveMerge, planDedupeApply, rejectMerge, type StoredMergeRequest } from '../src/services/dedupe';
import { type Harness, makeHarness, seedDevice, seedPhoto, seedSpace, seedUser } from './fakes/harness';

type P4 = Pick<Photo, 'id' | 'ownerUid' | 'spaceIds' | 'albumIds' | 'takenAt'>;
const ph = (id: string, ownerUid: string, spaceIds: string[], over: Partial<P4> = {}): P4 => ({
  id,
  ownerUid,
  spaceIds,
  albumIds: [],
  takenAt: null,
  ...over,
});

describe('정리 계획 (planDedupeApply)', () => {
  it('같은 주인의 사본: 공유 범위·앨범·촬영 일시를 원본에 합치고 바로 휴지통', () => {
    const keep = ph('k', 'mom', ['home'], { albumIds: ['a1'] });
    const copy = ph('c', 'mom', ['home', 'mom-side'], { albumIds: ['a2'], takenAt: 123 });
    const plan = planDedupeApply(keep, [copy], 'dad');
    expect(plan).toEqual({
      keepUpdate: { spaceIds: ['home', 'mom-side'], albumIds: ['a1', 'a2'], takenAt: 123 },
      trash: ['c'],
      held: [],
      heldAddSpaceIds: [],
    });
  });

  it('원본에 촬영 일시가 있으면 그대로', () => {
    const plan = planDedupeApply(ph('k', 'mom', ['home'], { takenAt: 5 }), [ph('c', 'mom', ['home'], { takenAt: 9 })], 'mom');
    expect(plan.keepUpdate).toBeNull();
    expect(plan.trash).toEqual(['c']);
  });

  it('다른 사람 사본인데 원본에 새 공간이 생기지 않으면 바로 정리', () => {
    const plan = planDedupeApply(ph('k', 'mom', ['home', 'dad-side']), [ph('c', 'dad', ['home'])], 'dad');
    expect(plan.held).toEqual([]);
    expect(plan.trash).toEqual(['c']);
  });

  it('다른 사람 사본 때문에 원본이 주인이 정하지 않은 공간에 보이게 되면 주인 확인 대기', () => {
    const plan = planDedupeApply(ph('k', 'mom', ['home']), [ph('c1', 'dad', ['home', 'dad-side']), ph('c2', 'mom', ['home'])], 'dad');
    expect(plan.held).toEqual(['c1']);
    expect(plan.trash).toEqual(['c2']);
    expect(plan.heldAddSpaceIds).toEqual(['dad-side']);
    expect(plan.keepUpdate).toBeNull();
  });

  it('정리하는 사람이 원본 주인이면 그 자리에서 승인', () => {
    const plan = planDedupeApply(ph('k', 'mom', ['home']), [ph('c1', 'dad', ['home', 'dad-side'])], 'mom');
    expect(plan.held).toEqual([]);
    expect(plan.keepUpdate?.spaceIds).toEqual(['home', 'dad-side']);
  });

  it('"나만 보기"였던 원본이 공용 공간과 합쳐지면 개인 공간은 빠진다', () => {
    const plan = planDedupeApply(ph('k', 'mom', ['personal_mom']), [ph('c', 'mom', ['home'])], 'mom');
    expect(plan.keepUpdate?.spaceIds).toEqual(['home']);
  });
});

describe('정리하기 → 원본 주인 확인', () => {
  let h: Harness;
  beforeEach(async () => {
    h = makeHarness();
    seedUser(h, 'mom', ['home']);
    seedUser(h, 'dad', ['home', 'dad-side']);
    seedUser(h, 'grandpa', ['home']);
    seedSpace(h, 'home', ['grandpa'], ['mom', 'dad', 'grandpa']);
    seedSpace(h, 'dad-side', ['dad'], ['dad']);
    seedDevice(h, 'mom', 'mom-phone');
    await seedPhoto(h, { id: 'keep', ownerUid: 'mom', spaceIds: ['home'] });
    await seedPhoto(h, { id: 'dadcopy', ownerUid: 'dad', spaceIds: ['home', 'dad-side'], width: 1000, height: 750, takenAt: 77, albumIds: ['dad-album'] });
    await seedPhoto(h, { id: 'momcopy', ownerUid: 'mom', spaceIds: ['home'], width: 1000, height: 750 });
    h.docs.seed(P.group('g1'), {
      id: 'g1',
      spaceId: 'home',
      kind: 'copy',
      photoIds: ['keep', 'dadcopy', 'momcopy'],
      keepPhotoId: 'keep',
      status: 'open',
      updatedAt: 0,
    } satisfies DedupeGroup);
  });

  it('관리자만 정리할 수 있다', async () => {
    await expect(applyDedupe(h.deps, 'mom', 'g1', { keepPhotoId: 'keep', removePhotoIds: ['momcopy'] })).rejects.toMatchObject({ status: 403 });
  });

  it('보류 → 승인하면 합치고 사본을 휴지통으로', async () => {
    const res = await applyDedupe(h.deps, 'grandpa', 'g1', { keepPhotoId: 'keep', removePhotoIds: ['dadcopy', 'momcopy'] });
    expect(res).toEqual({ trashed: ['momcopy'], awaitingOwner: ['dadcopy'] });
    expect(h.docs.data<Photo>(P.photo('momcopy'))).toMatchObject({ status: 'trashed', trashedBy: 'grandpa' });
    expect(h.docs.data<Photo>(P.photo('dadcopy'))).toMatchObject({ status: 'active' });
    expect(h.docs.data<DedupeGroup>(P.group('g1'))).toMatchObject({ status: 'awaiting_owner' });
    const [mr] = h.docs.list<StoredMergeRequest>('mergeRequests');
    expect(mr).toMatchObject({ groupId: 'g1', photoId: 'keep', ownerUid: 'mom', addSpaceIds: ['dad-side'], requestedBy: 'grandpa', status: 'pending', removePhotoIds: ['dadcopy'] });
    expect(h.push.sent.map((s) => s.msg.data.type)).toEqual(['merge-request']);
    expect((await h.index.getPhoto('momcopy'))?.status).toBe('trashed');

    await expect(approveMerge(h.deps, 'dad', mr!._id)).rejects.toMatchObject({ status: 403 });
    expect(await approveMerge(h.deps, 'mom', mr!._id)).toEqual({ trashed: ['dadcopy'] });
    const keep = h.docs.data<Photo>(P.photo('keep'))!;
    expect(keep.spaceIds.sort()).toEqual(['dad-side', 'home']);
    expect(keep.albumIds).toEqual(['dad-album']);
    expect(keep.takenAt).toBe(77);
    expect((await h.index.getPhoto('keep'))?.spaceIds.sort()).toEqual(['dad-side', 'home']);
    expect(await h.index.visiblePhotoIds(['keep'], ['dad-side'], 'someone')).toEqual(new Set(['keep']));
    expect(h.docs.data<Photo>(P.photo('dadcopy'))).toMatchObject({ status: 'trashed' });
    expect(h.docs.data<DedupeGroup>(P.group('g1'))).toMatchObject({ status: 'applied' });
    await expect(approveMerge(h.deps, 'mom', mr!._id)).rejects.toMatchObject({ status: 409 });
    await h.flush();
  });

  it('거절하면 사본은 그대로, 정리된 것이 없으면 묶음은 무시', async () => {
    await applyDedupe(h.deps, 'grandpa', 'g1', { keepPhotoId: 'keep', removePhotoIds: ['dadcopy'] });
    const [mr] = h.docs.list<StoredMergeRequest>('mergeRequests');
    await rejectMerge(h.deps, 'mom', mr!._id);
    expect(h.docs.data<Photo>(P.photo('dadcopy'))).toMatchObject({ status: 'active' });
    expect(h.docs.data<Photo>(P.photo('keep'))!.spaceIds).toEqual(['home']);
    expect(h.docs.data<DedupeGroup>(P.group('g1'))).toMatchObject({ status: 'dismissed' });
  });

  it('묶음에 없는 사진이나 닫힌 묶음은 거부', async () => {
    await expect(applyDedupe(h.deps, 'grandpa', 'g1', { keepPhotoId: 'keep', removePhotoIds: ['nope'] })).rejects.toMatchObject({ status: 409 });
    await applyDedupe(h.deps, 'grandpa', 'g1', { keepPhotoId: 'keep', removePhotoIds: ['momcopy'] });
    await expect(applyDedupe(h.deps, 'grandpa', 'g1', { keepPhotoId: 'keep', removePhotoIds: ['momcopy'] })).rejects.toMatchObject({
      code: 'group_closed',
    });
  });
});
