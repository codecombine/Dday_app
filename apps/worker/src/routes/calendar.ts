// 구글 캘린더 연동
import type { GoogleStatus } from '@hanjibung/core';
import type { Hono } from 'hono';

import type { AppEnv, Mw } from '../hono-env';
import {
  connectGoogle,
  disconnectGoogle,
  googleStatus,
  handleWebhook,
  updateGoogleSettings,
} from '../services/calendar-sync';
import { readJson, str, strArray } from '../util/validate';

export function calendarRoutes(app: Hono<AppEnv>, auth: Mw): void {
  app.post('/calendar/google/connect', auth, async (c) => {
    const body = await readJson(c);
    const redirectUri = typeof body.redirectUri === 'string' ? body.redirectUri.slice(0, 2048) : '';
    const res = await connectGoogle(c.get('deps'), c.get('user').uid, {
      code: str(body, 'code', { max: 4096 }),
      redirectUri,
      mirrorSpaceIds: strArray(body, 'mirrorSpaceIds', { max: 20, optional: true }),
    });
    return c.json<GoogleStatus>(res);
  });

  app.get('/calendar/google', auth, async (c) => {
    return c.json<GoogleStatus>(await googleStatus(c.get('deps'), c.get('user').uid));
  });

  app.put('/calendar/google/settings', auth, async (c) => {
    const body = await readJson(c);
    const res = await updateGoogleSettings(c.get('deps'), c.get('user').uid, strArray(body, 'mirrorSpaceIds', { max: 20 }));
    return c.json<GoogleStatus>(res);
  });

  app.delete('/calendar/google', auth, async (c) => {
    const del = c.req.query('deleteCalendar');
    await disconnectGoogle(c.get('deps'), c.get('user').uid, del === '1' || del === 'true');
    return c.json<GoogleStatus>({ connected: false, email: null, mirrorSpaceIds: [] });
  });

  // 구글 변경 알림 (채널 토큰으로 인증). 빨리 200을 주고 실제 동기화는 waitUntil에서
  app.post('/calendar/google/webhook', async (c) => {
    const r = await handleWebhook(c.get('deps'), {
      channelId: c.req.header('X-Goog-Channel-ID'),
      token: c.req.header('X-Goog-Channel-Token'),
      state: c.req.header('X-Goog-Resource-State'),
    });
    if (r === 'forbidden') return c.json({ error: 'forbidden', message: '권한이 없어요' }, 403);
    return c.body(null, 204);
  });
}
