import type { BootstrapResponse, Photo, PhotoUrlsResponse, PreparePhotosResponse } from '@hanjibung/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { P } from '../src/repo/docstore';
import { authUser, type Harness, makeHarness, seedDevice, seedPhoto, seedSpace, seedUser, TEST_ENV } from './fakes/harness';

/** 토큰 'tok:<uid>' → 그 사용자 (클레임은 가짜 Auth에 저장된 값) */
function setup() {
  const h = makeHarness();
  const app = createApp({
    makeDeps: () => h.deps,
    verifyToken: async (token) => {
      const m = /^tok:(.+)$/.exec(token);
      if (!m) throw new Error('bad token');
      return authUser(m[1]!, h.auth.claims.get(m[1]!) ?? []);
    },
  });
  const call = (method: string, path: string, opts: { uid?: string; body?: unknown; headers?: Record<string, string>; raw?: BodyInit } = {}) =>
    app.request(
      path,
      {
        method,
        headers: {
          ...(opts.uid ? { Authorization: `Bearer tok:${opts.uid}` } : {}),
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...opts.headers,
        },
        body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      },
      TEST_ENV,
    );
  return { h, app, call };
}

describe('라우트', () => {
  let h: Harness;
  let call: ReturnType<typeof setup>['call'];

  beforeEach(() => {
    ({ h, call } = setup());
  });

  it('GET /health', async () => {
    const res = await call('GET', '/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, service: 'hanjibung-api' });
  });

  it('토큰이 없거나 틀리면 401, 모르는 주소는 404 (오류 형식 { error, message })', async () => {
    let res = await call('POST', '/me/bootstrap');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized', message: '로그인이 필요해요' });
    res = await call('POST', '/me/bootstrap', { headers: { Authorization: 'Bearer nope' } });
    expect(res.status).toBe(401);
    res = await call('GET', '/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'not_found' });
  });

  it('CORS: 웹 주소와 개발 주소만 허용', async () => {
    let res = await call('OPTIONS', '/photos/urls', {
      headers: { Origin: 'https://hanjibung.test', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization' },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://hanjibung.test');
    expect(res.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain('authorization');
    res = await call('GET', '/health', { headers: { Origin: 'http://localhost:8081' } });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8081');
    res = await call('GET', '/health', { headers: { Origin: 'https://evil.example' } });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('시작하기 → 공간 만들기 (잘못된 색상은 400)', async () => {
    let res = await call('POST', '/me/bootstrap', { uid: 'mom', body: { displayName: '엄마' } });
    expect(res.status).toBe(200);
    expect(await res.json<BootstrapResponse>()).toEqual({ personalSpaceId: 'personal_mom', spaceIds: ['personal_mom'], claimsChanged: true });

    res = await call('POST', '/spaces', { uid: 'mom', body: { name: '약수집', color: '#123456' } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_color', message: '색상을 다시 골라 주세요' });

    res = await call('POST', '/spaces', { uid: 'mom', body: { name: '약수집', color: '#0B3040', rules: { onLeave: 'keep' } } });
    expect(res.status).toBe(201);
    const { spaceId, claimsChanged } = await res.json<{ spaceId: string; claimsChanged: boolean }>();
    expect(claimsChanged).toBe(true);
    expect(h.auth.claims.get('mom')).toEqual(['personal_mom', spaceId]);

    res = await call('POST', '/spaces', { uid: 'mom', body: { name: '약수집', color: '#0B3040', rules: { onLeave: 'never' } } });
    expect(res.status).toBe(400);
  });

  it('사진: 준비 → 파일 올리기 → 완료 → 서명 주소 → 내려받기', async () => {
    seedUser(h, 'mom', ['home'], '엄마');
    seedUser(h, 'dad', ['home']);
    seedSpace(h, 'home', ['mom'], ['mom', 'dad']);
    h.auth.claims.set('mom', ['personal_mom', 'home']);
    h.auth.claims.set('dad', ['personal_dad', 'home']);
    seedDevice(h, 'dad', 'dad-phone');
    h.docs.seed(P.user('dad'), { ...h.docs.data(P.user('dad')), settings: { notify: { newPhoto: true } } });

    const input = {
      sha256: 'ab'.repeat(32),
      phash: '0f0f0f0f0f0f0f0f',
      width: 4032,
      height: 3024,
      bytes: 5,
      mime: 'image/heic',
      hasExif: true,
      takenAt: 1_760_000_000_000,
      cameraModel: 'Galaxy',
      source: 'camera',
      originalName: '가족사진.heic',
    };
    let res = await call('POST', '/photos/prepare', { uid: 'mom', body: { photos: [input] } });
    expect(res.status).toBe(200);
    const [prepared] = (await res.json<PreparePhotosResponse>()).photos;
    const id = prepared!.photoId!;
    expect(prepared).toEqual({ sha256: input.sha256, photoId: id, existingPhotoId: null });
    expect(h.docs.data<Photo>(P.photo(id))).toMatchObject({ status: 'uploading', spaceIds: [], ownerUid: 'mom' });

    // 다른 사람은 파일을 올릴 수 없다
    res = await call('PUT', `/photos/${id}/blob/original`, { uid: 'dad', raw: new Uint8Array([1, 2, 3, 4, 5]), headers: { 'Content-Length': '5' } });
    expect(res.status).toBe(403);
    // 완료 전에 썸네일이 없으면 409
    res = await call('PUT', `/photos/${id}/blob/original`, { uid: 'mom', raw: new Uint8Array([1, 2, 3, 4, 5]), headers: { 'Content-Length': '5' } });
    expect(res.status).toBe(200);
    res = await call('POST', `/photos/${id}/commit`, { uid: 'mom', body: { spaceIds: ['home'], albumIds: [], notify: true } });
    expect(res.status).toBe(409);
    res = await call('PUT', `/photos/${id}/blob/thumb`, { uid: 'mom', raw: new Uint8Array([9, 9]), headers: { 'Content-Length': '2' } });
    expect(res.status).toBe(200);
    res = await call('PUT', `/photos/${id}/blob/bogus`, { uid: 'mom', raw: new Uint8Array([9]), headers: { 'Content-Length': '1' } });
    expect(res.status).toBe(404);
    // 내가 속하지 않은 공간이나 "나만 보기"+공용 섞기는 거부
    res = await call('POST', `/photos/${id}/commit`, { uid: 'mom', body: { spaceIds: ['personal_mom', 'home'], albumIds: [], notify: false } });
    expect(res.status).toBe(400);
    res = await call('POST', `/photos/${id}/commit`, { uid: 'mom', body: { spaceIds: ['home'], albumIds: [], notify: true } });
    expect(res.status).toBe(200);
    await h.flush();
    expect(h.docs.data<Photo>(P.photo(id))).toMatchObject({ status: 'active', spaceIds: ['home'], bytes: 5 });
    // 묶음 알림 (아빠는 새 사진 알림을 켰다)
    expect(h.push.sent.map((s) => s.msg.notification?.body)).toEqual(['엄마가 사진 1장을 올렸어요']);

    // 같은 파일을 아빠가 올리려 하면 기존 사진을 알려준다
    res = await call('POST', '/photos/prepare', { uid: 'dad', body: { photos: [input] } });
    expect((await res.json<PreparePhotosResponse>()).photos[0]).toEqual({ sha256: input.sha256, photoId: null, existingPhotoId: id });

    // 서명 주소: 볼 수 있는 것만, 미리보기가 없으면 원본으로
    res = await call('POST', '/photos/urls', { uid: 'dad', body: { ids: [id, 'unknown'], variant: 'preview' } });
    const urls = await res.json<PhotoUrlsResponse>();
    expect(Object.keys(urls.urls)).toEqual([id]);
    const url = new URL(urls.urls[id]!);
    expect(url.pathname).toBe(`/b/${id}/original`);
    res = await call('POST', '/photos/urls', { uid: 'stranger', body: { ids: [id], variant: 'thumb' } });
    expect((await res.json<PhotoUrlsResponse>()).urls).toEqual({});

    res = await call('GET', `${url.pathname}${url.search}&dl=1`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/heic');
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=3600');
    expect(res.headers.get('Content-Disposition')).toContain("filename*=UTF-8''%EA%B0%80%EC%A1%B1%EC%82%AC%EC%A7%84.heic");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3, 4, 5]);
    res = await call('GET', `${url.pathname}?exp=${url.searchParams.get('exp')}&sig=${'0'.repeat(64)}`);
    expect(res.status).toBe(403);
    h.tick(2 * 60 * 60 * 1000);
    res = await call('GET', `${url.pathname}${url.search}`);
    expect(res.status).toBe(410);
  });

  it('PATCH /photos/:id: 올린 사람만, 유효한 공유 범위로', async () => {
    seedUser(h, 'mom', ['home']);
    seedUser(h, 'dad', ['home']);
    seedSpace(h, 'home', ['mom'], ['mom', 'dad']);
    await seedPhoto(h, { id: 'p', ownerUid: 'mom', spaceIds: ['personal_mom'] });
    let res = await call('PATCH', '/photos/p', { uid: 'dad', body: { spaceIds: ['home'] } });
    expect(res.status).toBe(403);
    res = await call('PATCH', '/photos/p', { uid: 'mom', body: { spaceIds: ['home', 'personal_mom'] } });
    expect(res.status).toBe(400);
    res = await call('PATCH', '/photos/p', { uid: 'mom', body: { spaceIds: ['home'] } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ photoId: 'p', spaceIds: ['home'], albumIds: [] });
    expect(await h.index.visiblePhotoIds(['p'], ['home'], 'dad')).toEqual(new Set(['p']));
    await h.flush();
  });

  it('휴지통: 규칙이 "올린 사람과 관리자"면 관리자는 그 공간에서만 뺀다', async () => {
    seedUser(h, 'mom', ['home']);
    seedUser(h, 'dad', ['home', 'dad-side']);
    seedSpace(h, 'home', ['mom'], ['mom', 'dad'], { photoDelete: 'ownerOrAdmin' });
    seedSpace(h, 'dad-side', ['dad'], ['dad']);
    await seedPhoto(h, { id: 'p', ownerUid: 'dad', spaceIds: ['home', 'dad-side'] });
    let res = await call('POST', '/photos/p/trash', { uid: 'mom' });
    expect(res.status).toBe(403);
    res = await call('POST', '/photos/p/trash', { uid: 'mom', body: { spaceId: 'home' } });
    expect(await res.json()).toEqual({ trashed: false, removedFromSpace: 'home' });
    expect(h.docs.data<Photo>(P.photo('p'))).toMatchObject({ status: 'active', spaceIds: ['dad-side'] });
    res = await call('POST', '/photos/p/trash', { uid: 'dad' });
    expect(await res.json()).toEqual({ trashed: true, removedFromSpace: null });
    expect(h.docs.data<Photo>(P.photo('p'))).toMatchObject({ status: 'trashed', trashedBy: 'dad' });
    res = await call('POST', '/photos/p/restore', { uid: 'dad' });
    expect(res.status).toBe(200);
    expect(h.docs.data<Photo>(P.photo('p'))).toMatchObject({ status: 'active', trashedAt: null });
    await h.flush();
  });

  it('초대 미리보기는 토큰 없이, 수락은 로그인 필요', async () => {
    seedUser(h, 'mom', ['home']);
    seedSpace(h, 'home', ['mom'], ['mom']);
    let res = await call('POST', '/spaces/home/invites', { uid: 'mom' });
    expect(res.status).toBe(201);
    const { token } = await res.json<{ token: string }>();
    res = await call('GET', `/invites/${token}`);
    expect(await res.json()).toMatchObject({ spaceName: 'home', memberCount: 1, valid: true });
    expect((await call('POST', `/invites/${token}/accept`)).status).toBe(401);
    res = await call('POST', `/invites/${token}/accept`, { uid: 'newbie' });
    expect(await res.json()).toEqual({ spaceId: 'home', spaceIds: ['personal_newbie', 'home'], claimsChanged: true });
    await h.flush();
  });

  it('카카오 로그인: 액세스 토큰 → 맞춤 토큰 (서비스 계정 없으면 500 설정 오류)', async () => {
    const res = await call('POST', '/auth/kakao', { body: { accessToken: 'kakao-access' } });
    // 시험 환경은 서비스 계정이 없어서 서명 단계에서 실패해야 한다 (사용자는 미리 만들어 둔다)
    expect(res.status).toBe(500);
    expect(h.auth.users.get('kakao:12345')).toEqual({ displayName: '엄마' });
    const bad = await call('POST', '/auth/kakao', { body: { code: 'bad', redirectUri: 'https://hanjibung.test/auth/kakao' } });
    expect(bad.status).toBe(401);
    expect(await bad.json()).toMatchObject({ error: 'kakao_failed' });
    // 다른 카카오 앱에서 받은 토큰으로는 로그인할 수 없다
    const other = await call('POST', '/auth/kakao', { body: { accessToken: 'other-app' } });
    expect(other.status).toBe(401);
    expect(await other.json()).toMatchObject({ error: 'kakao_failed' });
  });

  it('기기 등록, 항목 변경 통지', async () => {
    seedUser(h, 'mom', ['home'], '엄마');
    seedUser(h, 'dad', ['home']);
    seedSpace(h, 'home', ['mom'], ['mom', 'dad']);
    h.auth.claims.set('mom', ['personal_mom', 'home']);
    let res = await call('POST', '/devices', { uid: 'dad', body: { deviceId: 'pixel', fcmToken: 'fcm-dad', platform: 'android' } });
    expect(res.status).toBe(200);
    h.docs.seed(P.item('trip'), { id: 'trip', kind: 'event', title: '제주 여행', ownerUid: 'mom', spaceIds: ['home'], date: '2026-11-01', allDay: true, time: null, endDate: '2026-11-02', endTime: null, repeat: 'none', lunar: null, mode: 'countdown', countFromOne: true, milestones: false, memo: '', updatedAt: 1 });
    res = await call('POST', '/items/trip/changed', { uid: 'mom', body: { created: true } });
    expect(res.status).toBe(202);
    await h.flush();
    const toDad = h.push.sent.filter((s) => s.token === 'fcm-dad');
    expect(toDad.map((s) => s.msg.notification?.body ?? `silent:${s.msg.data.type}`)).toEqual([
      '엄마가 일정을 추가했어요: 제주 여행',
      'silent:items-changed',
    ]);
    // 볼 수 없는 항목은 403
    h.docs.seed(P.item('secret'), { id: 'secret', ownerUid: 'dad', spaceIds: ['personal_dad'], title: 'x', updatedAt: 1 });
    res = await call('POST', '/items/secret/changed', { uid: 'mom' });
    expect(res.status).toBe(403);
  });
});
