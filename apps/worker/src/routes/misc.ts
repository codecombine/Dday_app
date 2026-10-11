// 상태 확인, 항목 변경 통지
import type { Hono } from 'hono';

import type { AppEnv, Mw } from '../hono-env';
import { itemChanged } from '../services/items';
import { bool, readJson, safeId } from '../util/validate';

export function miscRoutes(app: Hono<AppEnv>, auth: Mw): void {
  app.get('/health', (c) => c.json({ ok: true, service: 'hanjibung-api', time: c.get('deps').now() }));

  app.post('/items/:id/changed', auth, async (c) => {
    const body = await readJson(c, true);
    await itemChanged(c.get('deps'), c.get('user'), safeId(c.req.param('id')), bool(body, 'created', false));
    return c.json({ ok: true }, 202);
  });
}
