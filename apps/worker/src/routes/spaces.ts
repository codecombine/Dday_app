// 공간·초대·구성원
import { type CreateSpaceResponse, type InvitePreview, SPACE_COLORS } from '@hanjibung/core';
import type { Hono } from 'hono';

import { badRequest } from '../errors';
import type { AppEnv, Mw } from '../hono-env';
import { acceptInvite, createInvite, previewInvite, revokeInvite } from '../services/invites';
import { createSharedSpace, leaveSpace, parseRules, removeMember, setMemberRole } from '../services/membership';
import { oneOf, optOneOf, optStr, readJson, safeId, str } from '../util/validate';

export function spaceRoutes(app: Hono<AppEnv>, auth: Mw): void {
  app.post('/spaces', auth, async (c) => {
    const body = await readJson(c);
    const name = str(body, 'name', { max: 30 });
    const color = str(body, 'color', { max: 16 });
    if (!(SPACE_COLORS as readonly string[]).includes(color)) throw badRequest('색상을 다시 골라 주세요', 'invalid_color');
    const res = await createSharedSpace(c.get('deps'), c.get('user').uid, { name, color, rules: parseRules(body.rules) });
    return c.json<CreateSpaceResponse & { spaceIds: string[]; claimsChanged: boolean }>({ ...res, claimsChanged: true }, 201);
  });

  app.post('/spaces/:id/invites', auth, async (c) => {
    const body = await readJson(c, true);
    const target = optStr(body, 'targetMemberId', { max: 128 });
    const res = await createInvite(c.get('deps'), c.get('user').uid, safeId(c.req.param('id')), target ? safeId(target, 'targetMemberId') : undefined);
    return c.json(res, 201);
  });

  app.delete('/invites/:token', auth, async (c) => {
    await revokeInvite(c.get('deps'), c.get('user').uid, c.req.param('token'));
    return c.json({ ok: true });
  });

  // 토큰 불필요 (가입 전 미리보기)
  app.get('/invites/:token', async (c) => {
    return c.json<InvitePreview>(await previewInvite(c.get('deps'), c.req.param('token')));
  });

  app.post('/invites/:token/accept', auth, async (c) => {
    return c.json(await acceptInvite(c.get('deps'), c.get('user'), c.req.param('token')));
  });

  app.post('/spaces/:id/leave', auth, async (c) => {
    const body = await readJson(c, true);
    const choice = optOneOf(body, 'photoChoice', ['keep', 'remove'] as const);
    return c.json(await leaveSpace(c.get('deps'), c.get('user').uid, safeId(c.req.param('id')), choice));
  });

  app.delete('/spaces/:id/members/:memberId', auth, async (c) => {
    await removeMember(c.get('deps'), c.get('user').uid, safeId(c.req.param('id')), safeId(c.req.param('memberId'), 'memberId'));
    return c.json({ ok: true });
  });

  app.post('/spaces/:id/members/:memberId/role', auth, async (c) => {
    const body = await readJson(c);
    const role = oneOf(body, 'role', ['admin', 'member'] as const);
    await setMemberRole(c.get('deps'), c.get('user').uid, safeId(c.req.param('id')), safeId(c.req.param('memberId'), 'memberId'), role);
    return c.json({ ok: true });
  });
}
