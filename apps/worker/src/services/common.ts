// 서비스 공통: 문서 읽기, 권한 확인, 공유 범위 정리
import type { Album, Item, Member, Photo, Space, UserDoc } from '@hanjibung/core';

import type { Deps } from '../deps';
import { conflict, forbidden, notFound } from '../errors';
import { P } from '../repo/docstore';

/** 개인 공간 ID는 uid로 정해진다 */
export const personalSpaceId = (uid: string) => `personal_${uid}`;

/** 한 사람이 속할 수 있는 공간 수 (맞춤 클레임 1000바이트 제한) */
export const MAX_SPACES = 20;

export async function getUser(deps: Deps, uid: string): Promise<UserDoc | null> {
  const u = await deps.docs.get<UserDoc>(P.user(uid));
  return u ? { ...u, uid, spaceIds: u.spaceIds ?? [] } : null;
}

export async function requireUser(deps: Deps, uid: string): Promise<UserDoc> {
  const u = await getUser(deps, uid);
  if (!u) throw conflict('not_bootstrapped', '처음 시작하기를 먼저 완료해 주세요');
  return u;
}

export async function getSpace(deps: Deps, id: string): Promise<Space | null> {
  const s = await deps.docs.get<Space>(P.space(id));
  return s ? { ...s, id, adminUids: s.adminUids ?? [], memberUids: s.memberUids ?? [] } : null;
}

export async function requireSpace(deps: Deps, id: string): Promise<Space> {
  const s = await getSpace(deps, id);
  if (!s) throw notFound('공간을 찾을 수 없어요', 'space_not_found');
  return s;
}

export function requireAdmin(space: Space, uid: string): void {
  if (!space.adminUids.includes(uid)) throw forbidden('공간 관리자만 할 수 있어요', 'admin_only');
}

export async function getMember(deps: Deps, spaceId: string, memberId: string): Promise<Member | null> {
  const m = await deps.docs.get<Member>(P.member(spaceId, memberId));
  return m ? { ...m, id: memberId, spaceId } : null;
}

export async function getPhotoDoc(deps: Deps, id: string): Promise<Photo | null> {
  const p = await deps.docs.get<Photo>(P.photo(id));
  return p ? { ...p, id, spaceIds: p.spaceIds ?? [], albumIds: p.albumIds ?? [] } : null;
}

export async function requirePhoto(deps: Deps, id: string): Promise<Photo> {
  const p = await getPhotoDoc(deps, id);
  if (!p) throw notFound('사진을 찾을 수 없어요', 'photo_not_found');
  return p;
}

export async function getPhotoDocs(deps: Deps, ids: readonly string[]): Promise<Map<string, Photo>> {
  const docs = await deps.docs.getMany<Photo>(ids.map(P.photo));
  const out = new Map<string, Photo>();
  for (const id of ids) {
    const p = docs.get(P.photo(id));
    if (p) out.set(id, { ...p, id, spaceIds: p.spaceIds ?? [], albumIds: p.albumIds ?? [] });
  }
  return out;
}

export async function getItem(deps: Deps, id: string): Promise<Item | null> {
  const it = await deps.docs.get<Item>(P.item(id));
  return it ? { ...it, id, spaceIds: it.spaceIds ?? [] } : null;
}

export async function getAlbums(deps: Deps, ids: readonly string[]): Promise<Map<string, Album>> {
  const docs = await deps.docs.getMany<Album>(ids.map(P.album));
  const out = new Map<string, Album>();
  for (const id of ids) {
    const a = docs.get(P.album(id));
    if (a) out.set(id, { ...a, id, spaceIds: a.spaceIds ?? [] });
  }
  return out;
}

export function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

export const uniq = <T>(list: Iterable<T>): T[] => [...new Set(list)];

/**
 * 공유 범위를 합칠 때의 정리: 개인 공간("나만 보기")과 공용 공간이 섞이면 개인 공간을 뺀다 (명세서 3.2).
 * personalIds는 주인의 개인 공간 (주인 것만 빼고, 다른 사람의 개인 공간은 그대로 둔다).
 */
export function normalizeShare(spaceIds: readonly string[], ownerPersonalId: string): string[] {
  const list = uniq(spaceIds);
  if (list.length > 1 && list.includes(ownerPersonalId)) return list.filter((s) => s !== ownerPersonalId);
  return list;
}

/** 공간 하나를 뺀 공유 범위. 비면 주인의 개인 공간으로 */
export function withoutSpace(spaceIds: readonly string[], spaceId: string, ownerPersonalId: string): string[] {
  const rest = spaceIds.filter((s) => s !== spaceId);
  return rest.length ? rest : [ownerPersonalId];
}

/** 한국어 주격 조사: 받침이 있으면 '이', 없으면 '가'. 한글이 아니면 '님이' */
export function subjectParticle(name: string): string {
  const last = name.trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  if (!last || code < 0 || code >= 11172) return `${name}님이`;
  return `${name}${code % 28 ? '이' : '가'}`;
}
