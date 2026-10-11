// 초대 링크 (명세서 2.3): 7일 동안 여러 번 쓸 수 있고, 관리자가 언제든 무효화할 수 있다
import type { AcceptInviteResponse, CreateInviteResponse, InvitePreview, Member } from '@hanjibung/core';

import type { AuthUser } from '../auth/firebase-auth';
import type { Deps } from '../deps';
import { badRequest, conflict, HttpError, notFound } from '../errors';
import { P } from '../repo/docstore';
import type { Invite } from '../repo/index-store';
import { randomToken } from '../util/crypto';
import { DAY } from '../util/time';
import { getMember, getSpace, getUser, MAX_SPACES, requireAdmin, requireSpace, requireUser } from './common';
import { bootstrap, joinSpace, syncClaims } from './membership';

export const INVITE_TTL = 7 * DAY;

export type InviteState = 'valid' | 'expired' | 'revoked';

export function inviteState(inv: Pick<Invite, 'expiresAt' | 'revoked'>, now: number): InviteState {
  if (inv.revoked) return 'revoked';
  if (now >= inv.expiresAt) return 'expired';
  return 'valid';
}

export function inviteUrl(webOrigin: string, token: string): string {
  return `${webOrigin}/invite/${token}`;
}

export async function createInvite(deps: Deps, uid: string, spaceId: string, targetMemberId?: string): Promise<CreateInviteResponse> {
  const space = await requireSpace(deps, spaceId);
  requireAdmin(space, uid);
  if (space.kind === 'personal') throw badRequest('개인 공간에는 초대할 수 없어요', 'personal_space');
  if (targetMemberId) {
    const m = await getMember(deps, spaceId, targetMemberId);
    if (!m) throw notFound('구성원을 찾을 수 없어요', 'member_not_found');
    if (m.uid) throw badRequest('이미 앱을 쓰는 구성원이에요', 'member_has_account');
  }
  const now = deps.now();
  const inv: Invite = {
    token: randomToken(24),
    spaceId,
    createdBy: uid,
    targetMemberId: targetMemberId ?? null,
    expiresAt: now + INVITE_TTL,
    revoked: false,
    uses: 0,
    createdAt: now,
  };
  await deps.index.insertInvite(inv);
  return { token: inv.token, url: inviteUrl(deps.cfg.webOrigin, inv.token), expiresAt: inv.expiresAt };
}

async function requireInvite(deps: Deps, token: string): Promise<Invite> {
  const inv = /^[A-Za-z0-9_-]{16,64}$/.test(token) ? await deps.index.getInvite(token) : null;
  if (!inv) throw notFound('초대 링크를 찾을 수 없어요', 'invite_not_found');
  return inv;
}

export async function revokeInvite(deps: Deps, uid: string, token: string): Promise<void> {
  const inv = await requireInvite(deps, token);
  const space = await getSpace(deps, inv.spaceId);
  if (space) requireAdmin(space, uid);
  else if (inv.createdBy !== uid) throw notFound('초대 링크를 찾을 수 없어요', 'invite_not_found');
  await deps.index.revokeInvite(token);
}

export async function previewInvite(deps: Deps, token: string): Promise<InvitePreview> {
  const inv = await requireInvite(deps, token);
  const space = await getSpace(deps, inv.spaceId);
  if (!space) throw notFound('공간이 없어졌어요', 'space_not_found');
  // 구성원은 하위 컬렉션 한 번에 (수·이름·초대한 사람), 항목 수는 집계 쿼리, 사진 수는 D1
  const members = (await deps.docs.query<Member>(P.members(space.id))).map((m) => ({ ...m.data, id: m.id }));
  const itemCount = await deps.docs.count('items', [{ field: 'spaceIds', op: 'ARRAY_CONTAINS', value: space.id }]);
  const photoCount = await deps.index.countSpacePhotos(space.id);
  const inviter = members.find((m) => m.uid === inv.createdBy);
  const target = inv.targetMemberId ? members.find((m) => m.id === inv.targetMemberId && !m.uid) : undefined;
  return {
    spaceId: space.id,
    spaceName: space.name,
    spaceColor: space.color,
    inviterName: inviter?.displayName ?? (await getUser(deps, inv.createdBy))?.displayName ?? '가족',
    memberCount: members.length,
    itemCount,
    photoCount,
    memberNames: members.slice(0, 20).map((m) => m.displayName),
    targetMemberName: target?.displayName ?? null,
    expiresAt: inv.expiresAt,
    valid: inviteState(inv, deps.now()) === 'valid',
  };
}

export async function acceptInvite(
  deps: Deps,
  authUser: AuthUser,
  token: string,
): Promise<AcceptInviteResponse & { claimsChanged: boolean }> {
  const inv = await requireInvite(deps, token);
  const state = inviteState(inv, deps.now());
  if (state === 'revoked') throw new HttpError(410, 'invite_revoked', '관리자가 이 초대 링크를 무효화했어요');
  if (state === 'expired') throw new HttpError(410, 'invite_expired', '초대 링크가 만료됐어요. 새 링크를 받아 주세요');
  const space = await requireSpace(deps, inv.spaceId);

  // 초대 링크로 처음 들어온 사람은 여기서 시작하기까지 처리한다
  if (!(await getUser(deps, authUser.uid))) await bootstrap(deps, authUser);
  const user = await requireUser(deps, authUser.uid);

  if (space.memberUids.includes(user.uid)) {
    const spaceIds = user.spaceIds.includes(space.id) ? user.spaceIds : [...user.spaceIds, space.id];
    await syncClaims(deps, user.uid, spaceIds);
    return { spaceId: space.id, spaceIds, claimsChanged: true };
  }
  if (user.spaceIds.length >= MAX_SPACES) throw conflict('too_many_spaces', `공간은 ${MAX_SPACES}개까지 들어갈 수 있어요`);
  const profile = inv.targetMemberId ? await getMember(deps, space.id, inv.targetMemberId) : null;
  const spaceIds = await joinSpace(deps, { space, user, profile: profile && !profile.uid ? profile : null });
  await deps.index.bumpInviteUses(token);
  return { spaceId: space.id, spaceIds, claimsChanged: true };
}
