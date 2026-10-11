// 중복 정리·합치기 확인
import type { ApplyDedupeResponse, ScanResponse } from '@hanjibung/core';
import type { Hono } from 'hono';

import type { AppEnv, Mw } from '../hono-env';
import { applyDedupe, approveMerge, dismissDedupe, rejectMerge, scanSpace } from '../services/dedupe';
import { readJson, safeId, str, strArray } from '../util/validate';

export function dedupeRoutes(app: Hono<AppEnv>, auth: Mw): void {
  app.post('/spaces/:id/dedupe/scan', auth, async (c) => {
    const groups = await scanSpace(c.get('deps'), c.get('user').uid, safeId(c.req.param('id')));
    return c.json<ScanResponse>({ groups });
  });

  app.post('/dedupe/:groupId/apply', auth, async (c) => {
    const body = await readJson(c);
    const res = await applyDedupe(c.get('deps'), c.get('user').uid, safeId(c.req.param('groupId'), 'groupId'), {
      keepPhotoId: safeId(str(body, 'keepPhotoId', { max: 128 }), 'keepPhotoId'),
      removePhotoIds: strArray(body, 'removePhotoIds', { max: 200, itemMax: 128 }),
    });
    return c.json<ApplyDedupeResponse>(res);
  });

  app.post('/dedupe/:groupId/dismiss', auth, async (c) => {
    await dismissDedupe(c.get('deps'), c.get('user').uid, safeId(c.req.param('groupId'), 'groupId'));
    return c.json({ ok: true });
  });

  app.post('/merge-requests/:id/approve', auth, async (c) => {
    return c.json(await approveMerge(c.get('deps'), c.get('user').uid, safeId(c.req.param('id'))));
  });

  app.post('/merge-requests/:id/reject', auth, async (c) => {
    await rejectMerge(c.get('deps'), c.get('user').uid, safeId(c.req.param('id')));
    return c.json({ ok: true });
  });
}
