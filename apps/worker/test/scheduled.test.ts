import { describe, expect, it } from 'vitest';

import { P } from '../src/repo/docstore';
import { connectGoogle } from '../src/services/calendar-sync';
import { purgeTrash, reconcileItems, runDaily, runScheduled } from '../src/services/scheduled';
import { DAY, MINUTE } from '../src/util/time';
import { makeHarness, NOW, seedItem, seedPhoto, seedSpace, seedUser } from './fakes/harness';

describe('정기 작업', () => {
  it('휴지통 30일 지난 사진과 7일 넘게 멈춘 올리기를 완전히 지운다', async () => {
    const h = makeHarness();
    seedUser(h, 'mom', []);
    await seedPhoto(h, { id: 'old', ownerUid: 'mom', spaceIds: ['personal_mom'], status: 'trashed', trashedAt: NOW - 31 * DAY });
    await seedPhoto(h, { id: 'recent', ownerUid: 'mom', spaceIds: ['personal_mom'], status: 'trashed', trashedAt: NOW - 5 * DAY });
    await seedPhoto(h, { id: 'stuck', ownerUid: 'mom', spaceIds: [], status: 'uploading', createdAt: NOW - 8 * DAY });
    await seedPhoto(h, { id: 'fresh-upload', ownerUid: 'mom', spaceIds: [], status: 'uploading', createdAt: NOW - DAY });
    for (const v of ['original', 'thumb.jpg']) h.blobs.objects.set(`photos/old/${v}`, { bytes: new Uint8Array([1]), contentType: 'image/jpeg' });
    h.docs.seed(P.album('a1'), { name: '여행', ownerUid: 'mom', spaceIds: ['personal_mom'], coverPhotoId: 'old' });

    expect(await purgeTrash(h.deps)).toBe(2);
    expect(h.docs.data(P.photo('old'))).toBeUndefined();
    expect(h.docs.data(P.photo('stuck'))).toBeUndefined();
    expect(await h.index.getPhoto('old')).toBeNull();
    expect(h.blobs.objects.size).toBe(0);
    expect(h.docs.data<{ coverPhotoId: string | null }>(P.album('a1'))!.coverPhotoId).toBeNull();
    expect(h.docs.data(P.photo('recent'))).toBeDefined();
    expect(h.docs.data(P.photo('fresh-upload'))).toBeDefined();
  });

  it('하루 한 번만, 만료 30일 지난 초대 삭제', async () => {
    const h = makeHarness();
    await h.index.insertInvite({ token: 'old-invite-token-xxxxxx', spaceId: 's', createdBy: 'u', targetMemberId: null, expiresAt: NOW - 31 * DAY, revoked: false, uses: 0, createdAt: 0 });
    await h.index.insertInvite({ token: 'expired-recently-xxxxxx', spaceId: 's', createdBy: 'u', targetMemberId: null, expiresAt: NOW - DAY, revoked: false, uses: 0, createdAt: 0 });
    expect(await runDaily(h.deps)).toBe(true);
    expect(await runDaily(h.deps)).toBe(false);
    expect(await h.index.getInvite('old-invite-token-xxxxxx')).toBeNull();
    expect(await h.index.getInvite('expired-recently-xxxxxx')).not.toBeNull();
  });

  it('놓친 항목 변경을 구글 캘린더에 보정한다', async () => {
    const h = makeHarness();
    seedUser(h, 'mom', ['home']);
    seedSpace(h, 'home', ['mom'], ['mom']);
    const item = seedItem(h, { id: 'dinner', ownerUid: 'mom', spaceIds: ['home'], title: '저녁' });
    await connectGoogle(h.deps, 'mom', { code: 'ok', redirectUri: '' });
    await h.flush();
    await reconcileItems(h.deps); // 기준 시각 기록
    const acc = (await h.index.getGoogleAccount('mom'))!;

    // 앱이 /items/:id/changed를 못 보낸 변경
    h.tick(10 * MINUTE);
    h.docs.seed(P.item('dinner'), { ...item, title: '외식', updatedAt: h.deps.now() });
    h.tick(30 * MINUTE);
    expect(await reconcileItems(h.deps)).toBe(1);
    expect(h.google.events(acc.calendarId!).map((e) => e.summary)).toEqual(['외식']);
    await runScheduled(h.deps); // 전체 순서가 오류 없이 돈다
  });
});
