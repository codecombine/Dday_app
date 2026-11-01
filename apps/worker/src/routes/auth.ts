// 로그인·내 계정·기기
import type { BootstrapResponse, KakaoAuthResponse } from '@hanjibung/core';
import type { Hono } from 'hono';

import { mintCustomToken } from '../auth/custom-token';
import { HttpError } from '../errors';
import type { AppEnv, Mw } from '../hono-env';
import { P } from '../repo/docstore';
import { deleteAccount } from '../services/account';
import { bootstrap } from '../services/membership';
import { oneOf, optStr, readJson, safeId, str } from '../util/validate';

/** 카카오 로그인 응답: 계약(KakaoAuthResponse) + 이름 */
export interface KakaoAuthResult extends KakaoAuthResponse {
  uid: string;
  displayName: string | null;
}

export function authRoutes(app: Hono<AppEnv>, auth: Mw): void {
  app.post('/auth/kakao', async (c) => {
    const deps = c.get('deps');
    const body = await readJson(c);
    let accessToken: string;
    try {
      if (typeof body.accessToken === 'string') {
        accessToken = str(body, 'accessToken', { max: 4096 });
        await deps.kakao.verifyToken(accessToken);
      } else accessToken = await deps.kakao.exchangeCode(str(body, 'code', { max: 4096 }), str(body, 'redirectUri', { max: 2048 }));
    } catch (e) {
      if (e instanceof HttpError) throw e;
      console.warn('카카오 코드 교환 실패', e);
      throw new HttpError(401, 'kakao_failed', '카카오 로그인에 실패했어요. 다시 시도해 주세요');
    }
    let profile;
    try {
      profile = await deps.kakao.me(accessToken);
    } catch (e) {
      console.warn('카카오 사용자 조회 실패', e);
      throw new HttpError(401, 'kakao_failed', '카카오 로그인에 실패했어요. 다시 시도해 주세요');
    }
    const uid = `kakao:${profile.id}`;
    // Firebase 사용자를 미리 만들어 두면 ID 토큰에 이름(name)이 들어간다
    await deps.auth.ensureUser(uid, { displayName: profile.nickname, photoUrl: profile.profileImage });
    const customToken = await mintCustomToken(deps.serviceAccount(), uid, { now: deps.now() });
    return c.json<KakaoAuthResult>({ customToken, uid, displayName: profile.nickname });
  });

  app.post('/me/bootstrap', auth, async (c) => {
    const body = await readJson(c, true);
    const res = await bootstrap(c.get('deps'), c.get('user'), optStr(body, 'displayName', { max: 200 }));
    return c.json<BootstrapResponse>(res);
  });

  app.delete('/me', auth, async (c) => {
    const body = await readJson(c, true);
    const raw = body.photoChoices;
    const photoChoices: Record<string, 'keep' | 'remove'> = {};
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (v === 'keep' || v === 'remove') photoChoices[safeId(k, 'photoChoices')] = v;
      }
    }
    await deleteAccount(c.get('deps'), c.get('user'), { photoChoices });
    return c.json({ ok: true });
  });

  app.post('/devices', auth, async (c) => {
    const deps = c.get('deps');
    const body = await readJson(c);
    const deviceId = safeId(str(body, 'deviceId', { max: 128 }), 'deviceId');
    const fcmToken = str(body, 'fcmToken', { max: 4096 });
    const platform = oneOf(body, 'platform', ['android', 'ios', 'web'] as const);
    await deps.docs.commit([
      { op: 'set', path: P.device(c.get('user').uid, deviceId), data: { fcmToken, platform, updatedAt: deps.now() } },
    ]);
    return c.json({ ok: true });
  });

  // 로그아웃할 때 지워야 다른 계정 알림이 이 기기로 오지 않는다
  app.delete('/devices/:deviceId', auth, async (c) => {
    const deviceId = safeId(c.req.param('deviceId'), 'deviceId');
    await c.get('deps').docs.commit([{ op: 'delete', path: P.device(c.get('user').uid, deviceId) }]);
    return c.json({ ok: true });
  });
}
