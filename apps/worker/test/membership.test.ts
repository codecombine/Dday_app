import type { Item, Member, Photo, Space, UserDoc } from '@hanjibung/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { P } from '../src/repo/docstore';
import { deleteAccount, planDeletionPhotos } from '../src/services/account';
import { acceptInvite, createInvite, INVITE_TTL, inviteState, previewInvite, revokeInvite } from '../src/services/invites';
import {
  bootstrap,
  createSharedSpace,
  heirOf,
  leaveSpace,
  planLeaverPhotos,
  removeMember,
  setMemberRole,
} from '../src/services/membership';
import { DAY } from '../src/util/time';
import { authUser, type Harness, makeHarness, NOW, seedItem, seedPhoto, seedSpace, seedUser } from './fakes/harness';

describe('초대 만료 판단', () => {
  it('무효화 > 만료 > 유효', () => {
    expect(inviteState({ expiresAt: NOW + 1, revoked: false }, NOW)).toBe('valid');
    expect(inviteState({ expiresAt: NOW, revoked: false }, NOW)).toBe('expired');
    expect(inviteState({ expiresAt: NOW + DAY, revoked: true }, NOW)).toBe('revoked');
  });
});

describe('시작하기 (bootstrap)', () => {
  it('사용자 문서·개인 공간을 만들고, 두 번 불러도 같다', async () => {
    const h = makeHarness();
    const me = authUser('kakao:1', [], { name: '엄마', provider: 'kakao' });
    const first = await bootstrap(h.deps, me);
    expect(first).toEqual({ personalSpaceId: 'personal_kakao:1', spaceIds: ['personal_kakao:1'], claimsChanged: true });
    expect(h.auth.claims.get('kakao:1')).toEqual(['personal_kakao:1']);
    expect(h.docs.data<UserDoc>(P.user('kakao:1'))).toMatchObject({ displayName: '엄마', provider: 'kakao', settings: { theme: 'system' } });
    expect(h.docs.data<Space>(P.space('personal_kakao:1'))).toMatchObject({ kind: 'personal', name: '나만', adminUids: ['kakao:1'] });
    expect(h.docs.data<Member>(P.member('personal_kakao:1', 'kakao:1'))).toMatchObject({ uid: 'kakao:1', role: 'admin' });
    const again = await bootstrap(h.deps, { ...me, spaces: ['personal_kakao:1'] });
    expect(again.claimsChanged).toBe(false);
  });
});

describe('공간·초대', () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
    seedUser(h, 'mom', ['home'], '엄마');
    seedUser(h, 'dad', ['home'], '아빠');
    seedSpace(h, 'home', ['mom'], ['mom', 'dad'], {}, [{ id: 'grandma-profile', displayName: '외할머니' }]);
    seedItem(h, {
      id: 'checkup',
      ownerUid: 'mom',
      spaceIds: ['home'],
      participants: [{ spaceId: 'home', memberId: 'grandma-profile', displayName: '외할머니' }],
    });
  });

  it('공용 공간 만들기: 만든 사람이 관리자, 클레임 갱신', async () => {
    const { spaceId, spaceIds } = await createSharedSpace(h.deps, 'dad', {
      name: '시댁',
      color: '#B85C1E',
      rules: { photoDelete: 'ownerOrAdmin', onLeave: 'ask', eventEditDefault: 'owner' },
    });
    expect(spaceIds).toEqual(['personal_dad', 'home', spaceId]);
    expect(h.auth.claims.get('dad')).toEqual(spaceIds);
    expect(h.docs.data<Space>(P.space(spaceId))).toMatchObject({ kind: 'shared', adminUids: ['dad'], memberUids: ['dad'], rules: { photoDelete: 'ownerOrAdmin' } });
    expect(h.docs.data<UserDoc>(P.user('dad'))!.spaceIds).toContain(spaceId);
  });

  it('관리자만 초대 링크를 만든다, 미리보기는 개수와 이름을 보여준다', async () => {
    await expect(createInvite(h.deps, 'dad', 'home')).rejects.toMatchObject({ status: 403 });
    const inv = await createInvite(h.deps, 'mom', 'home', 'grandma-profile');
    expect(inv.url).toBe(`https://hanjibung.test/invite/${inv.token}`);
    expect(inv.expiresAt).toBe(NOW + INVITE_TTL);
    await seedPhoto(h, { ownerUid: 'mom', spaceIds: ['home'] });
    await seedPhoto(h, { ownerUid: 'mom', spaceIds: ['home'], status: 'trashed' });
    const preview = await previewInvite(h.deps, inv.token);
    expect(preview).toMatchObject({
      spaceId: 'home',
      inviterName: 'mom',
      memberCount: 3,
      itemCount: 1,
      photoCount: 1,
      targetMemberName: '외할머니',
      valid: true,
    });
    await expect(previewInvite(h.deps, 'x'.repeat(32))).rejects.toMatchObject({ status: 404 });
  });

  it('프로필 구성원 대상 초대 수락: 계정 구성원으로 바뀌고 참석 기록이 이어진다', async () => {
    const inv = await createInvite(h.deps, 'mom', 'home', 'grandma-profile');
    const grandma = authUser('grandma', [], { name: '김순자' });
    const res = await acceptInvite(h.deps, grandma, inv.token);
    expect(res).toEqual({ spaceId: 'home', spaceIds: ['personal_grandma', 'home'], claimsChanged: true });
    expect(h.auth.claims.get('grandma')).toEqual(['personal_grandma', 'home']);
    expect(h.docs.data(P.member('home', 'grandma-profile'))).toBeUndefined();
    expect(h.docs.data<Member>(P.member('home', 'grandma'))).toMatchObject({ uid: 'grandma', displayName: '외할머니', role: 'member' });
    expect(h.docs.data<Space>(P.space('home'))!.memberUids).toEqual(['mom', 'dad', 'grandma']);
    expect(h.docs.data<Item>(P.item('checkup'))!.participants).toEqual([{ spaceId: 'home', memberId: 'grandma', displayName: '외할머니' }]);
    expect((await h.index.getInvite(inv.token))?.uses).toBe(1);
    // 다시 수락해도 그대로
    expect((await acceptInvite(h.deps, { ...grandma, spaces: res.spaceIds }, inv.token)).spaceIds).toEqual(res.spaceIds);
    await h.flush();
  });

  it('무효화·만료된 링크는 410', async () => {
    const inv = await createInvite(h.deps, 'mom', 'home');
    h.tick(INVITE_TTL);
    await expect(acceptInvite(h.deps, authUser('x', []), inv.token)).rejects.toMatchObject({ status: 410, code: 'invite_expired' });
    const inv2 = await createInvite(h.deps, 'mom', 'home');
    await expect(revokeInvite(h.deps, 'dad', inv2.token)).rejects.toMatchObject({ status: 403 });
    await revokeInvite(h.deps, 'mom', inv2.token);
    await expect(acceptInvite(h.deps, authUser('x', []), inv2.token)).rejects.toMatchObject({ code: 'invite_revoked' });
    expect((await previewInvite(h.deps, inv2.token)).valid).toBe(false);
  });

  it('관리자 지정·해제: 마지막 관리자는 해제할 수 없다', async () => {
    await expect(setMemberRole(h.deps, 'mom', 'home', 'mom', 'member')).rejects.toMatchObject({ code: 'last_admin' });
    await expect(setMemberRole(h.deps, 'mom', 'home', 'grandma-profile', 'admin')).rejects.toMatchObject({ status: 400 });
    await setMemberRole(h.deps, 'mom', 'home', 'dad', 'admin');
    expect(h.docs.data<Space>(P.space('home'))!.adminUids).toEqual(['mom', 'dad']);
    expect(h.docs.data<Member>(P.member('home', 'dad'))!.role).toBe('admin');
    await setMemberRole(h.deps, 'dad', 'home', 'mom', 'member');
    expect(h.docs.data<Space>(P.space('home'))!.adminUids).toEqual(['dad']);
  });
});

describe('나가기·내보내기', () => {
  let h: Harness;
  beforeEach(async () => {
    h = makeHarness();
    seedUser(h, 'mom', ['home', 'mom-side']);
    seedUser(h, 'dad', ['home']);
    seedSpace(h, 'home', ['mom'], ['mom', 'dad'], { onLeave: 'ask' });
    seedSpace(h, 'mom-side', ['mom'], ['mom']);
    await seedPhoto(h, { id: 'only-home', ownerUid: 'dad', spaceIds: ['home'] });
    await seedPhoto(h, { id: 'also-dad', ownerUid: 'dad', spaceIds: ['home', 'personal_dad'] });
    await seedPhoto(h, { id: 'moms', ownerUid: 'mom', spaceIds: ['home'] });
    seedItem(h, { id: 'dad-item', ownerUid: 'dad', spaceIds: ['home'] });
    seedItem(h, { id: 'mom-item', ownerUid: 'mom', spaceIds: ['home', 'mom-side'] });
  });

  it('사진 처리 계획', () => {
    const photos = [
      { photoId: 'a', spaceIds: ['s'], status: 'active' },
      { photoId: 'b', spaceIds: ['s', 't'], status: 'active' },
      { photoId: 'c', spaceIds: ['t'], status: 'active' },
    ];
    expect(planLeaverPhotos(photos, 's', 'remove', 'admin', 'personal_me')).toEqual([
      { id: 'a', patch: { spaceIds: ['personal_me'] } },
      { id: 'b', patch: { spaceIds: ['t'] } },
    ]);
    expect(planLeaverPhotos(photos, 's', 'keep', 'admin', 'personal_me')).toEqual([{ id: 'a', patch: { ownerUid: 'admin' } }]);
    expect(heirOf({ ownerUid: 'o', adminUids: ['o', 'x'], memberUids: ['o', 'x', 'y'] }, 'o')).toBe('x');
    expect(heirOf({ ownerUid: 'o', adminUids: ['me'], memberUids: ['me', 'y'] }, 'me')).toBe('y');
  });

  it('"고르기" 규칙이면 선택이 필요하고, 마지막 관리자는 나갈 수 없다', async () => {
    await expect(leaveSpace(h.deps, 'dad', 'home')).rejects.toMatchObject({ code: 'photo_choice_required' });
    await expect(leaveSpace(h.deps, 'mom', 'home', 'keep')).rejects.toMatchObject({ code: 'last_admin' });
    await expect(leaveSpace(h.deps, 'dad', 'personal_dad')).rejects.toMatchObject({ code: 'personal_space' });
  });

  it('함께 지우기: 사진·항목이 공간에서 빠지고 갈 곳이 없으면 개인 공간으로', async () => {
    const res = await leaveSpace(h.deps, 'dad', 'home', 'remove');
    expect(res).toEqual({ spaceIds: ['personal_dad'], spaceDeleted: false, claimsChanged: true });
    expect(h.docs.data<Photo>(P.photo('only-home'))!.spaceIds).toEqual(['personal_dad']);
    expect(h.docs.data<Photo>(P.photo('also-dad'))!.spaceIds).toEqual(['personal_dad']);
    expect((await h.index.getPhoto('only-home'))!.spaceIds).toEqual(['personal_dad']);
    expect(h.docs.data<Item>(P.item('dad-item'))!.spaceIds).toEqual(['personal_dad']);
    expect(h.docs.data<Space>(P.space('home'))!.memberUids).toEqual(['mom']);
    expect(h.docs.data(P.member('home', 'dad'))).toBeUndefined();
    expect(h.docs.data<UserDoc>(P.user('dad'))!.spaceIds).toEqual(['personal_dad']);
    expect(h.auth.claims.get('dad')).toEqual(['personal_dad']);
    await h.flush();
  });

  it('공간에 남기기: 그 공간에만 있던 사진은 관리자에게 넘어간다', async () => {
    await leaveSpace(h.deps, 'dad', 'home', 'keep');
    expect(h.docs.data<Photo>(P.photo('only-home'))).toMatchObject({ ownerUid: 'mom', spaceIds: ['home'] });
    expect((await h.index.getPhoto('only-home'))!.ownerUid).toBe('mom');
    expect(h.docs.data<Photo>(P.photo('also-dad'))).toMatchObject({ ownerUid: 'dad' });
  });

  it('혼자 남은 공간에서 나가면 공간이 삭제된다', async () => {
    await leaveSpace(h.deps, 'dad', 'home', 'remove');
    const res = await leaveSpace(h.deps, 'mom', 'home');
    expect(res.spaceDeleted).toBe(true);
    expect(h.docs.data(P.space('home'))).toBeUndefined();
    expect(h.docs.list(P.members('home'))).toEqual([]);
    expect(h.docs.data<Photo>(P.photo('moms'))!.spaceIds).toEqual(['personal_mom']);
    expect(h.docs.data<Photo>(P.photo('only-home'))!.spaceIds).toEqual(['personal_dad']);
    expect(h.docs.data<Item>(P.item('mom-item'))!.spaceIds).toEqual(['mom-side']);
    expect(h.auth.claims.get('mom')).toEqual(['personal_mom', 'mom-side']);
  });

  it('관리자가 내보내기: 사진은 남기고 소유권은 관리자에게, 프로필 구성원은 그냥 삭제', async () => {
    await expect(removeMember(h.deps, 'dad', 'home', 'mom')).rejects.toMatchObject({ status: 403 });
    await removeMember(h.deps, 'mom', 'home', 'dad');
    expect(h.docs.data<Photo>(P.photo('only-home'))!.ownerUid).toBe('mom');
    expect(h.docs.data<Item>(P.item('dad-item'))!.spaceIds).toEqual(['personal_dad']);
    expect(h.auth.claims.get('dad')).toEqual(['personal_dad']);
    h.docs.seed(P.member('home', 'prof'), { displayName: '이모', uid: null, role: 'member' });
    await removeMember(h.deps, 'mom', 'home', 'prof');
    expect(h.docs.data(P.member('home', 'prof'))).toBeUndefined();
    await expect(removeMember(h.deps, 'mom', 'home', 'mom')).rejects.toMatchObject({ code: 'use_leave' });
  });
});

describe('계정 삭제', () => {
  let h: Harness;
  beforeEach(async () => {
    h = makeHarness();
    seedUser(h, 'mom', ['home']);
    seedUser(h, 'dad', ['home', 'solo']);
    seedSpace(h, 'home', ['dad'], ['mom', 'dad'], { onLeave: 'ask' });
    seedSpace(h, 'solo', ['dad'], ['dad']);
    await seedPhoto(h, { id: 'shared', ownerUid: 'dad', spaceIds: ['home'] });
    await seedPhoto(h, { id: 'private', ownerUid: 'dad', spaceIds: ['personal_dad'] });
    await seedPhoto(h, { id: 'solo-photo', ownerUid: 'dad', spaceIds: ['solo'] });
    h.blobs.objects.set('photos/private/original', { bytes: new Uint8Array([1]), contentType: 'image/jpeg' });
    seedItem(h, { id: 'dad-item', ownerUid: 'dad', spaceIds: ['home'] });
    seedItem(h, { id: 'mom-item', ownerUid: 'mom', spaceIds: ['home'] });
    h.docs.seed(P.device('dad', 'phone'), { fcmToken: 't', platform: 'android', updatedAt: NOW });
  });

  it('삭제 계획: 남기기 공간 사진은 넘기고 나머지는 지운다', () => {
    const plan = planDeletionPhotos(
      [
        { photoId: 'a', spaceIds: ['s', 't'], status: 'active' },
        { photoId: 'b', spaceIds: ['t'], status: 'active' },
        { photoId: 'c', spaceIds: [], status: 'uploading' },
      ],
      new Map([['s', 'keep'], ['t', 'remove']]),
      new Map([['s', 'admin-s']]),
    );
    expect(plan).toEqual({ transfer: [{ id: 'a', patch: { ownerUid: 'admin-s', spaceIds: ['s'] } }], remove: ['b', 'c'] });
  });

  it('"고르기" 공간의 선택이 없으면 거부', async () => {
    await expect(deleteAccount(h.deps, authUser('dad', ['personal_dad', 'home', 'solo']), {})).rejects.toMatchObject({
      code: 'photo_choice_required',
      extra: { spaceIds: ['home'] },
    });
  });

  it('남기기 선택: 공유 사진은 엄마에게, 개인 사진은 삭제, 항목·기기·계정 삭제, 엄마가 관리자가 된다', async () => {
    await deleteAccount(h.deps, authUser('dad', ['personal_dad', 'home', 'solo']), { photoChoices: { home: 'keep' } });
    await h.flush();
    expect(h.docs.data<Photo>(P.photo('shared'))).toMatchObject({ ownerUid: 'mom', spaceIds: ['home'] });
    expect(h.docs.data(P.photo('private'))).toBeUndefined();
    expect(await h.index.getPhoto('private')).toBeNull();
    expect(h.blobs.objects.has('photos/private/original')).toBe(false);
    expect(h.docs.data(P.photo('solo-photo'))).toBeUndefined();
    expect(h.docs.data(P.item('dad-item'))).toBeUndefined();
    expect(h.docs.data(P.item('mom-item'))).toBeDefined();
    expect(h.docs.data<Space>(P.space('home'))).toMatchObject({ memberUids: ['mom'], adminUids: ['mom'] });
    expect(h.docs.data<Member>(P.member('home', 'mom'))!.role).toBe('admin');
    expect(h.docs.data(P.space('solo'))).toBeUndefined();
    expect(h.docs.data(P.space('personal_dad'))).toBeUndefined();
    expect(h.docs.data(P.device('dad', 'phone'))).toBeUndefined();
    expect(h.docs.data(P.user('dad'))).toBeUndefined();
    expect(h.auth.deleted).toEqual(['dad']);
  });
});
