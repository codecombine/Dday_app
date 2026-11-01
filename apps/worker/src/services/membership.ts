// 공간 구성원 관리 (명세서 2.2, 3장). 구성원 변경은 Worker만 한다:
// spaces/{id}.memberUids·adminUids, spaces/{id}/members, users/{uid}.spaceIds, 맞춤 클레임 spaces를 함께 바꾼다.
import {
  type Album,
  type BootstrapResponse,
  DEFAULT_SPACE_RULES,
  DEFAULT_USER_SETTINGS,
  type Item,
  type Member,
  type MemberRole,
  type Participant,
  SPACE_COLORS,
  type Space,
  type SpaceRules,
  type UserDoc,
} from '@hanjibung/core';

import type { AuthUser } from '../auth/firebase-auth';
import type { Deps } from '../deps';
import { badRequest, conflict, forbidden, notFound } from '../errors';
import { isAlreadyExists } from '../google/firestore';
import { type Doc, P, type Write } from '../repo/docstore';
import { randomId } from '../util/crypto';
import { afterMembershipChange } from './calendar-sync';
import {
  getMember,
  getUser,
  MAX_SPACES,
  personalSpaceId,
  requireAdmin,
  requireSpace,
  requireUser,
  sameSet,
  uniq,
  withoutSpace,
} from './common';
import { forgetPhotos } from './dedupe';
import { pushToUsers, silent } from './notify';
import { patchPhotos, type PhotoPatch } from './photo-store';

export type PhotoChoice = 'keep' | 'remove';

export async function syncClaims(deps: Deps, uid: string, spaceIds?: readonly string[]): Promise<string[]> {
  const ids = spaceIds ? [...spaceIds] : ((await getUser(deps, uid))?.spaceIds ?? []);
  await deps.auth.setSpacesClaim(uid, ids);
  return ids;
}

// ── 첫 로그인 ────────────────────────────────────────

export async function bootstrap(deps: Deps, user: AuthUser, displayName?: string, attempt = 0): Promise<BootstrapResponse> {
  const uid = user.uid;
  const now = deps.now();
  const personalId = personalSpaceId(uid);
  const writes: Write[] = [];
  let doc = await getUser(deps, uid);
  if (!doc) {
    // 보안 규칙이 이름을 20자까지 허용하므로 길면 잘라 둔다 (넘으면 이후 설정 저장이 모두 거부된다)
    const name = (displayName || user.name || user.email?.split('@')[0] || '나').trim().slice(0, 20) || '나';
    doc = {
      uid,
      displayName: name,
      provider: user.provider,
      personalSpaceId: personalId,
      spaceIds: [personalId],
      settings: DEFAULT_USER_SETTINGS,
      createdAt: now,
    };
    writes.push({ op: 'set', path: P.user(uid), data: { ...doc }, mustNotExist: true });
  } else if (!doc.spaceIds.includes(personalId)) {
    writes.push({ op: 'arrayUnion', path: P.user(uid), field: 'spaceIds', values: [personalId] });
    doc = { ...doc, spaceIds: [personalId, ...doc.spaceIds] };
  }
  const personal = await deps.docs.get<Space>(P.space(personalId));
  if (!personal) {
    const space: Space = {
      id: personalId,
      name: '나만',
      color: SPACE_COLORS[0],
      kind: 'personal',
      ownerUid: uid,
      adminUids: [uid],
      memberUids: [uid],
      rules: DEFAULT_SPACE_RULES,
      createdAt: now,
    };
    const member: Member = { id: uid, spaceId: personalId, displayName: doc.displayName, role: 'admin', uid, managedByUid: null, joinedAt: now };
    writes.push({ op: 'set', path: P.space(personalId), data: { ...space }, mustNotExist: true });
    writes.push({ op: 'set', path: P.member(personalId, uid), data: { ...member } });
  }
  if (writes.length) {
    try {
      await deps.docs.commit(writes);
    } catch (e) {
      // 같은 사람이 동시에 시작한 경우 → 다시 읽어서 처리
      if (isAlreadyExists(e) && attempt < 2) return bootstrap(deps, user, displayName, attempt + 1);
      throw e;
    }
  }
  const claimsChanged = !sameSet(doc.spaceIds, user.spaces);
  if (claimsChanged) await syncClaims(deps, uid, doc.spaceIds);
  return { personalSpaceId: personalId, spaceIds: doc.spaceIds, claimsChanged };
}

// ── 공용 공간 만들기 ─────────────────────────────────

export function parseRules(input: unknown): SpaceRules {
  const r = (input && typeof input === 'object' ? input : {}) as Partial<Record<keyof SpaceRules, unknown>>;
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => {
    if (v === undefined) return fallback;
    if (typeof v !== 'string' || !allowed.includes(v as T)) throw badRequest('공간 규칙이 올바르지 않아요', 'invalid_rules');
    return v as T;
  };
  return {
    photoDelete: pick(r.photoDelete, ['owner', 'ownerOrAdmin'] as const, DEFAULT_SPACE_RULES.photoDelete),
    onLeave: pick(r.onLeave, ['keep', 'remove', 'ask'] as const, DEFAULT_SPACE_RULES.onLeave),
    eventEditDefault: pick(r.eventEditDefault, ['owner', 'all'] as const, DEFAULT_SPACE_RULES.eventEditDefault),
  };
}

export async function createSharedSpace(
  deps: Deps,
  uid: string,
  req: { name: string; color: string; rules: SpaceRules },
): Promise<{ spaceId: string; spaceIds: string[] }> {
  const user = await requireUser(deps, uid);
  if (user.spaceIds.length >= MAX_SPACES) throw conflict('too_many_spaces', `공간은 ${MAX_SPACES}개까지 들어갈 수 있어요`);
  const now = deps.now();
  const id = randomId();
  const space: Space = {
    id,
    name: req.name,
    color: req.color,
    kind: 'shared',
    ownerUid: uid,
    adminUids: [uid],
    memberUids: [uid],
    rules: req.rules,
    createdAt: now,
  };
  const member: Member = { id: uid, spaceId: id, displayName: user.displayName, role: 'admin', uid, managedByUid: null, joinedAt: now };
  await deps.docs.commit([
    { op: 'set', path: P.space(id), data: { ...space }, mustNotExist: true },
    { op: 'set', path: P.member(id, uid), data: { ...member } },
    { op: 'arrayUnion', path: P.user(uid), field: 'spaceIds', values: [id] },
  ]);
  const spaceIds = await syncClaims(deps, uid, uniq([...user.spaceIds, id]));
  return { spaceId: id, spaceIds };
}

// ── 참여 ─────────────────────────────────────────────

/**
 * 공간에 계정 구성원으로 넣는다. profile을 주면 그 프로필 구성원을 이 계정으로 바꾼다:
 * 문서 ID를 uid로 옮기고, 항목 참석자(participants)의 memberId도 uid로 바꿔 기록을 잇는다.
 */
export async function joinSpace(
  deps: Deps,
  opts: { space: Space; user: UserDoc; profile?: Member | null },
): Promise<string[]> {
  const { space, user, profile } = opts;
  const uid = user.uid;
  const now = deps.now();
  const role: MemberRole = profile?.role ?? 'member';
  const member: Member = {
    id: uid,
    spaceId: space.id,
    displayName: profile?.displayName || user.displayName,
    role,
    uid,
    managedByUid: null,
    joinedAt: now,
  };
  const writes: Write[] = [
    { op: 'arrayUnion', path: P.space(space.id), field: 'memberUids', values: [uid] },
    { op: 'set', path: P.member(space.id, uid), data: { ...member } },
    { op: 'arrayUnion', path: P.user(uid), field: 'spaceIds', values: [space.id] },
  ];
  if (role === 'admin') writes.push({ op: 'arrayUnion', path: P.space(space.id), field: 'adminUids', values: [uid] });
  if (profile && profile.id !== uid) writes.push({ op: 'delete', path: P.member(space.id, profile.id) });
  await deps.docs.commit(writes);
  if (profile && profile.id !== uid) await relinkParticipants(deps, space.id, profile.id, uid);
  const spaceIds = await syncClaims(deps, uid, uniq([...user.spaceIds, space.id]));
  deps.defer(afterMembershipChange(deps, [uid], []));
  return spaceIds;
}

/** 프로필 구성원 → 계정 구성원으로 바뀔 때 참석 기록을 잇는다 */
async function relinkParticipants(deps: Deps, spaceId: string, oldMemberId: string, newMemberId: string): Promise<void> {
  const items = await deps.docs.query<Item>('items', { where: [{ field: 'spaceIds', op: 'ARRAY_CONTAINS', value: spaceId }] });
  const writes: Write[] = [];
  for (const it of items) {
    const ps: Participant[] = it.data.participants ?? [];
    if (!ps.some((p) => p.spaceId === spaceId && p.memberId === oldMemberId)) continue;
    const next = ps.map((p) => (p.spaceId === spaceId && p.memberId === oldMemberId ? { ...p, memberId: newMemberId } : p));
    writes.push({ op: 'update', path: it.path, data: { participants: next } });
  }
  if (writes.length) await deps.docs.commit(writes);
}

// ── 나가기·내보내기 ──────────────────────────────────

export function resolvePhotoChoice(rule: SpaceRules['onLeave'], choice: PhotoChoice | undefined): PhotoChoice {
  if (rule === 'keep' || rule === 'remove') return rule;
  if (!choice) throw badRequest('사진을 공간에 남길지 함께 지울지 골라 주세요', 'photo_choice_required');
  return choice;
}

/** 나가는 사람의 사진을 넘겨받을 관리자 (공간을 만든 사람 우선) */
export function heirOf(space: Pick<Space, 'ownerUid' | 'adminUids' | 'memberUids'>, leavingUid: string): string | null {
  const admins = space.adminUids.filter((u) => u !== leavingUid);
  if (admins.includes(space.ownerUid)) return space.ownerUid;
  return admins[0] ?? space.memberUids.find((u) => u !== leavingUid) ?? null;
}

/**
 * 나가는 사람의 사진 처리 계획.
 * - remove: 그 공간에서 뺀다 (다른 공간이 없으면 본인 개인 공간으로)
 * - keep: 그 공간에만 있던 사진은 관리자에게 소유권을 넘긴다. 다른 공간에도 있으면 그대로 둔다.
 */
export function planLeaverPhotos(
  photos: readonly { photoId: string; spaceIds: string[]; status: string }[],
  spaceId: string,
  choice: PhotoChoice,
  heirUid: string | null,
  personalId: string,
): { id: string; patch: PhotoPatch }[] {
  const out: { id: string; patch: PhotoPatch }[] = [];
  for (const p of photos) {
    if (!p.spaceIds.includes(spaceId) || p.status === 'uploading') continue;
    const rest = p.spaceIds.filter((s) => s !== spaceId);
    if (choice === 'remove' || !heirUid) out.push({ id: p.photoId, patch: { spaceIds: rest.length ? rest : [personalId] } });
    else if (rest.length === 0) out.push({ id: p.photoId, patch: { ownerUid: heirUid } });
  }
  return out;
}

/** 사용자의 항목·앨범에서 공간을 뺀다 (비면 개인 공간으로). 바뀐 항목 ID를 돌려준다 */
async function rescopeOwned(deps: Deps, uid: string, spaceId: string, personalId: string): Promise<string[]> {
  const now = deps.now();
  const writes: Write[] = [];
  const changed: string[] = [];
  const items = await deps.docs.query<Item>('items', { where: [{ field: 'ownerUid', op: 'EQUAL', value: uid }] });
  for (const it of items) {
    if (!(it.data.spaceIds ?? []).includes(spaceId)) continue;
    writes.push({
      op: 'update',
      path: it.path,
      data: { spaceIds: withoutSpace(it.data.spaceIds, spaceId, personalId), updatedAt: now, updatedBy: uid },
    });
    changed.push(it.id);
  }
  const albums = await deps.docs.query<Album>('albums', { where: [{ field: 'ownerUid', op: 'EQUAL', value: uid }] });
  for (const a of albums) {
    if (!(a.data.spaceIds ?? []).includes(spaceId)) continue;
    writes.push({ op: 'update', path: a.path, data: { spaceIds: withoutSpace(a.data.spaceIds, spaceId, personalId) } });
  }
  if (writes.length) await deps.docs.commit(writes);
  return changed;
}

/** 공간 쪽 구성원 기록에서 빼고(users 문서가 있으면 그쪽도) 클레임을 갱신한다 */
async function removeMembership(deps: Deps, spaceId: string, uid: string, opts: { updateUser: boolean }): Promise<void> {
  const writes: Write[] = [
    { op: 'arrayRemove', path: P.space(spaceId), field: 'memberUids', values: [uid] },
    { op: 'arrayRemove', path: P.space(spaceId), field: 'adminUids', values: [uid] },
    { op: 'delete', path: P.member(spaceId, uid) },
  ];
  const user = opts.updateUser ? await getUser(deps, uid) : null;
  if (user) writes.push({ op: 'arrayRemove', path: P.user(uid), field: 'spaceIds', values: [spaceId] });
  await deps.docs.commit(writes);
  if (user) await syncClaims(deps, uid, user.spaceIds.filter((s) => s !== spaceId));
}

/** 계정 구성원을 공간에서 떼어 낸다 (나가기·내보내기 공통) */
async function detachMember(
  deps: Deps,
  opts: { space: Space; uid: string; choice: PhotoChoice; heirUid: string | null; personalId: string },
): Promise<string[]> {
  const { space, uid, choice, heirUid, personalId } = opts;
  const rows = await deps.index.listOwnerPhotosInSpace(uid, space.id);
  const patches = planLeaverPhotos(rows, space.id, choice, heirUid, personalId);
  await patchPhotos(deps, patches);
  const removedFromSpace = patches.filter((p) => p.patch.spaceIds).map((p) => p.id);
  await forgetPhotos(deps, removedFromSpace, [space.id]);
  const changedItems = await rescopeOwned(deps, uid, space.id, personalId);
  await removeMembership(deps, space.id, uid, { updateUser: true });
  deps.defer(afterMembershipChange(deps, [uid], changedItems));
  return changedItems;
}

/**
 * 공간 삭제 (마지막 구성원이 나갈 때). 공간에 있던 사진·항목·앨범은 그 공간만 빠지고,
 * 다른 공간이 없으면 각 주인의 개인 공간으로 옮긴다.
 */
export async function deleteSpace(deps: Deps, space: Space, actorUid: string, opts: { updateUser: boolean }): Promise<void> {
  const now = deps.now();
  const photos = await deps.index.listSpacePhotos(space.id);
  await patchPhotos(
    deps,
    photos.map((p) => ({ id: p.photoId, patch: { spaceIds: withoutSpace(p.spaceIds, space.id, personalSpaceId(p.ownerUid)) } })),
  );
  const writes: Write[] = [];
  const changedItems: string[] = [];
  const items = await deps.docs.query<Item>('items', { where: [{ field: 'spaceIds', op: 'ARRAY_CONTAINS', value: space.id }] });
  for (const it of items) {
    writes.push({
      op: 'update',
      path: it.path,
      data: { spaceIds: withoutSpace(it.data.spaceIds, space.id, personalSpaceId(it.data.ownerUid)), updatedAt: now, updatedBy: actorUid },
    });
    changedItems.push(it.id);
  }
  const albums = await deps.docs.query<Album>('albums', { where: [{ field: 'spaceIds', op: 'ARRAY_CONTAINS', value: space.id }] });
  for (const a of albums) {
    writes.push({ op: 'update', path: a.path, data: { spaceIds: withoutSpace(a.data.spaceIds, space.id, personalSpaceId(a.data.ownerUid)) } });
  }
  const groups = await deps.docs.query('dedupeGroups', { where: [{ field: 'spaceId', op: 'EQUAL', value: space.id }] });
  for (const g of groups) writes.push({ op: 'delete', path: g.path });
  const members = await deps.docs.query(P.members(space.id));
  for (const m of members) writes.push({ op: 'delete', path: m.path });
  writes.push({ op: 'delete', path: P.space(space.id) });
  await deps.docs.commit(writes);
  await deps.index.deleteInvitesForSpace(space.id);
  for (const uid of space.memberUids) {
    if (!opts.updateUser) continue;
    const user = await getUser(deps, uid);
    if (!user) continue;
    await deps.docs.commit([{ op: 'arrayRemove', path: P.user(uid), field: 'spaceIds', values: [space.id] }]);
    await syncClaims(deps, uid, user.spaceIds.filter((s) => s !== space.id));
  }
  deps.defer(afterMembershipChange(deps, opts.updateUser ? space.memberUids : [], changedItems));
}

export interface LeaveResult {
  spaceIds: string[];
  spaceDeleted: boolean;
  claimsChanged: boolean;
}

export async function leaveSpace(deps: Deps, uid: string, spaceId: string, choice?: PhotoChoice): Promise<LeaveResult> {
  const user = await requireUser(deps, uid);
  const space = await requireSpace(deps, spaceId);
  if (space.kind === 'personal') throw badRequest('개인 공간은 나갈 수 없어요', 'personal_space');
  if (!space.memberUids.includes(uid) && !user.spaceIds.includes(spaceId)) throw forbidden('이 공간의 구성원이 아니에요', 'not_member');
  const remaining = user.spaceIds.filter((s) => s !== spaceId);

  if (!space.memberUids.some((u) => u !== uid)) {
    await deleteSpace(deps, space, uid, { updateUser: true });
    return { spaceIds: remaining, spaceDeleted: true, claimsChanged: true };
  }
  if (space.adminUids.includes(uid) && !space.adminUids.some((u) => u !== uid)) {
    throw conflict('last_admin', '다른 관리자를 지정한 뒤에 나갈 수 있어요');
  }
  const photoChoice = resolvePhotoChoice(space.rules?.onLeave ?? 'ask', choice);
  await detachMember(deps, { space, uid, choice: photoChoice, heirUid: heirOf(space, uid), personalId: user.personalSpaceId });
  return { spaceIds: remaining, spaceDeleted: false, claimsChanged: true };
}

/** 관리자가 구성원을 내보낸다. 계정 구성원의 사진은 '남기기' 규칙으로 처리(소유권은 내보낸 관리자에게) */
export async function removeMember(deps: Deps, actorUid: string, spaceId: string, memberId: string): Promise<void> {
  const space = await requireSpace(deps, spaceId);
  requireAdmin(space, actorUid);
  const member = await getMember(deps, spaceId, memberId);
  if (!member) throw notFound('구성원을 찾을 수 없어요', 'member_not_found');
  if (!member.uid) {
    await deps.docs.commit([{ op: 'delete', path: P.member(spaceId, memberId) }]);
    return;
  }
  if (member.uid === actorUid) throw badRequest('나 자신은 "공간 나가기"로 나갈 수 있어요', 'use_leave');
  if (space.kind === 'personal') throw badRequest('개인 공간에서는 내보낼 수 없어요', 'personal_space');
  const target = member.uid;
  const targetUser = await getUser(deps, target);
  await detachMember(deps, {
    space,
    uid: target,
    choice: 'keep',
    heirUid: actorUid,
    personalId: targetUser?.personalSpaceId ?? personalSpaceId(target),
  });
  // 계정 구성원 문서 ID는 uid지만, 혹시 다른 ID로 남아 있던 문서도 지운다
  if (memberId !== target) await deps.docs.commit([{ op: 'delete', path: P.member(spaceId, memberId) }]);
  // 내보내진 사람의 앱이 토큰을 새로 받도록
  deps.defer(pushToUsers(deps, [target], silent({ type: 'items-changed', reason: 'membership', spaceId })));
}

export async function setMemberRole(deps: Deps, actorUid: string, spaceId: string, memberId: string, role: MemberRole): Promise<void> {
  const space = await requireSpace(deps, spaceId);
  requireAdmin(space, actorUid);
  if (space.kind === 'personal') throw badRequest('개인 공간에서는 바꿀 수 없어요', 'personal_space');
  const member = await getMember(deps, spaceId, memberId);
  if (!member) throw notFound('구성원을 찾을 수 없어요', 'member_not_found');
  if (!member.uid && role === 'admin') throw badRequest('앱을 쓰는 구성원만 관리자가 될 수 있어요', 'profile_cannot_admin');
  if (member.role === role && (!member.uid || space.adminUids.includes(member.uid) === (role === 'admin'))) return;
  if (role === 'member' && member.uid && space.adminUids.includes(member.uid) && !space.adminUids.some((u) => u !== member.uid)) {
    throw conflict('last_admin', '관리자가 한 명은 있어야 해요');
  }
  const writes: Write[] = [{ op: 'update', path: P.member(spaceId, memberId), data: { role } }];
  if (member.uid) {
    writes.push({ op: role === 'admin' ? 'arrayUnion' : 'arrayRemove', path: P.space(spaceId), field: 'adminUids', values: [member.uid] });
  }
  await deps.docs.commit(writes);
}

/** 계정 삭제용: 공간 구성원 기록만 지운다 (users 문서는 곧 지워진다) */
export async function dropMembershipForDeletion(deps: Deps, space: Space, uid: string, heirUid: string | null): Promise<void> {
  const writes: Write[] = [];
  if (heirUid && space.adminUids.includes(uid) && !space.adminUids.some((u) => u !== uid)) {
    // 마지막 관리자가 탈퇴하면 다음 사람을 관리자로 (탈퇴는 막지 않는다)
    writes.push({ op: 'arrayUnion', path: P.space(space.id), field: 'adminUids', values: [heirUid] });
    const heirMember: Doc<Member>[] = await deps.docs.query<Member>(P.members(space.id), {
      where: [{ field: 'uid', op: 'EQUAL', value: heirUid }],
      limit: 1,
    });
    for (const m of heirMember) writes.push({ op: 'update', path: m.path, data: { role: 'admin' } });
  }
  await deps.docs.commit(writes);
  await removeMembership(deps, space.id, uid, { updateUser: false });
}
