// 사진 올리기·보기·휴지통 (명세서 8장)
import {
  canRemovePhotoFromSpace,
  canView,
  type CommitPhotoRequest,
  isValidShare,
  type Photo,
  type PhotoUrlsResponse,
  type PhotoVariant,
  type PreparedPhoto,
  type PreparePhotoInput,
  type UserDoc,
} from '@hanjibung/core';

import type { AuthUser } from '../auth/firebase-auth';
import type { Deps } from '../deps';
import { badRequest, conflict, forbidden, HttpError, notFound } from '../errors';
import { P, type Write } from '../repo/docstore';
import type { PhotoIndexRow } from '../repo/index-store';
import { photoBlobKey } from '../storage/blob-store';
import { randomId } from '../util/crypto';
import {
  getAlbums,
  normalizeShare,
  personalSpaceId,
  requirePhoto,
  requireSpace,
  requireUser,
  uniq,
  withoutSpace,
} from './common';
import { forgetPhotos, type StoredMergeRequest, updateDedupeForPhoto } from './dedupe';
import { flushPhotoNotices, PHOTO_NOTICE_QUIET_MS, pushToUsers } from './notify';
import { patchPhoto, trashPhotos } from './photo-store';
import { photoUrlExpiry, signPhotoUrl } from './photo-urls';

/** 파일 크기 상한 */
export const MAX_BLOB_BYTES: Record<PhotoVariant, number> = {
  original: 50 * 1024 * 1024,
  preview: 5 * 1024 * 1024,
  thumb: 1024 * 1024,
};

/** PATCH /photos/:id 요청 (core/api.ts에 들어가기 전까지 Worker에 둔다) */
export interface UpdatePhotoRequest {
  spaceIds?: string[];
  albumIds?: string[];
}

// ── 올리기 준비 ──────────────────────────────────────

export async function preparePhotos(deps: Deps, user: AuthUser, inputs: readonly PreparePhotoInput[]): Promise<PreparedPhoto[]> {
  const out: PreparedPhoto[] = [];
  const writes: Write[] = [];
  const rows: PhotoIndexRow[] = [];
  const inBatch = new Map<string, string>();
  const now = deps.now();
  for (const p of inputs) {
    const sha = p.sha256.toLowerCase();
    const batchId = inBatch.get(sha);
    if (batchId) {
      out.push({ sha256: sha, photoId: batchId, existingPhotoId: null });
      continue;
    }
    const same = await deps.index.findSameFile(sha, user.spaces, user.uid);
    if (same.activeId) {
      out.push({ sha256: sha, photoId: null, existingPhotoId: same.activeId });
      continue;
    }
    if (same.pendingId) {
      // 올리다 멈춘 같은 파일 → 같은 ID로 이어서 올린다
      out.push({ sha256: sha, photoId: same.pendingId, existingPhotoId: null });
      inBatch.set(sha, same.pendingId);
      continue;
    }
    const id = randomId();
    inBatch.set(sha, id);
    const photo: Photo = {
      id,
      ownerUid: user.uid,
      spaceIds: [],
      albumIds: [],
      sha256: sha,
      phash: p.phash.toLowerCase(),
      width: p.width,
      height: p.height,
      bytes: p.bytes,
      hasExif: p.hasExif,
      takenAt: p.takenAt,
      source: p.source,
      mime: p.mime,
      cameraModel: p.cameraModel,
      originalName: p.originalName,
      status: 'uploading',
      trashedAt: null,
      trashedBy: null,
      createdAt: now,
    };
    writes.push({ op: 'set', path: P.photo(id), data: { ...photo }, mustNotExist: true });
    rows.push({
      photoId: id,
      ownerUid: user.uid,
      spaceIds: [],
      sha256: photo.sha256,
      phash: photo.phash,
      width: p.width,
      height: p.height,
      bytes: p.bytes,
      hasExif: p.hasExif,
      takenAt: p.takenAt,
      source: p.source,
      mime: p.mime,
      originalName: p.originalName,
      status: 'uploading',
      hasOriginal: false,
      hasPreview: false,
      hasThumb: false,
      trashedAt: null,
      createdAt: now,
    });
    out.push({ sha256: sha, photoId: id, existingPhotoId: null });
  }
  if (writes.length) await deps.docs.commit(writes);
  for (const r of rows) await deps.index.insertPhoto(r);
  return out;
}

// ── 파일 올리기 ──────────────────────────────────────

export async function uploadBlob(
  deps: Deps,
  uid: string,
  photoId: string,
  variant: PhotoVariant,
  body: ReadableStream | null,
  size: number | null,
): Promise<void> {
  const row = await deps.index.getPhoto(photoId);
  if (!row) throw notFound('사진을 찾을 수 없어요', 'photo_not_found');
  if (row.ownerUid !== uid) throw forbidden('올린 사람만 파일을 올릴 수 있어요');
  if (row.status !== 'uploading') throw conflict('already_committed', '이미 올리기가 끝난 사진이에요');
  if (!body || size === null || !Number.isSafeInteger(size)) throw new HttpError(411, 'length_required', '파일 크기(Content-Length)가 필요해요');
  if (size <= 0) throw badRequest('빈 파일이에요', 'empty_file');
  if (size > MAX_BLOB_BYTES[variant]) throw new HttpError(413, 'too_large', '파일이 너무 커요');
  const contentType = variant === 'original' ? row.mime : 'image/jpeg';
  await deps.blobs.put(photoBlobKey(photoId, variant), body, { contentType, size });
  await deps.index.markVariant(photoId, variant);
}

// ── 올리기 완료 ──────────────────────────────────────

async function validateAlbums(deps: Deps, albumIds: readonly string[], user: UserDoc, already: readonly string[] = []): Promise<void> {
  const fresh = albumIds.filter((a) => !already.includes(a));
  if (!fresh.length) return;
  const albums = await getAlbums(deps, fresh);
  for (const id of fresh) {
    const a = albums.get(id);
    if (!a || !canView(a, user.spaceIds)) throw badRequest('앨범을 찾을 수 없어요', 'invalid_album');
  }
}

export async function commitPhoto(deps: Deps, uid: string, photoId: string, req: CommitPhotoRequest): Promise<{ photoId: string; status: 'active' }> {
  const row = await deps.index.getPhoto(photoId);
  if (!row) throw notFound('사진을 찾을 수 없어요', 'photo_not_found');
  if (row.ownerUid !== uid) throw forbidden('올린 사람만 완료할 수 있어요');
  if (row.status === 'active') return { photoId, status: 'active' }; // 다시 보낸 요청
  if (row.status !== 'uploading') throw conflict('not_uploading', '휴지통에 있는 사진이에요');
  const user = await requireUser(deps, uid);
  if (!isValidShare(req.spaceIds, user.spaceIds, user.personalSpaceId)) {
    throw badRequest('공유 범위를 다시 골라 주세요', 'invalid_share');
  }
  await validateAlbums(deps, req.albumIds, user);
  const original = await deps.blobs.head(photoBlobKey(photoId, 'original'));
  const thumb = await deps.blobs.head(photoBlobKey(photoId, 'thumb'));
  if (!original || !thumb) throw conflict('blob_missing', '사진 파일이 다 올라가지 않았어요. 다시 시도해 주세요');

  await patchPhoto(deps, photoId, { status: 'active', spaceIds: req.spaceIds, albumIds: req.albumIds, bytes: original.size });
  deps.defer(updateDedupeForPhoto(deps, photoId));

  const shared = !(req.spaceIds.length === 1 && req.spaceIds[0] === user.personalSpaceId);
  if (req.notify && shared) {
    await deps.index.addNotice({ photoId, uid, spaceIds: req.spaceIds, createdAt: deps.now() });
    // 마지막 사진 뒤 조용해지면 한 번에 보낸다 (못 보내면 정기 작업이 보낸다)
    deps.defer(deps.sleep(PHOTO_NOTICE_QUIET_MS + 1000).then(() => flushPhotoNotices(deps, uid)));
  }
  return { photoId, status: 'active' };
}

// ── 공유 범위·앨범 바꾸기 (올린 사람) ──────────────────

export async function updatePhoto(
  deps: Deps,
  uid: string,
  photoId: string,
  req: UpdatePhotoRequest,
): Promise<{ photoId: string; spaceIds: string[]; albumIds: string[] }> {
  const photo = await requirePhoto(deps, photoId);
  if (photo.ownerUid !== uid) throw forbidden('올린 사람만 바꿀 수 있어요');
  if (photo.status !== 'active') throw conflict('not_active', '휴지통에 있거나 올리는 중인 사진이에요');
  const user = await requireUser(deps, uid);
  const spaceIds = req.spaceIds ?? photo.spaceIds;
  const albumIds = req.albumIds ?? photo.albumIds;
  if (req.spaceIds && !isValidShare(req.spaceIds, user.spaceIds, user.personalSpaceId)) {
    throw badRequest('공유 범위를 다시 골라 주세요', 'invalid_share');
  }
  if (req.albumIds) await validateAlbums(deps, req.albumIds, user, photo.albumIds);
  await patchPhoto(deps, photoId, {
    ...(req.spaceIds ? { spaceIds } : {}),
    ...(req.albumIds ? { albumIds } : {}),
  });
  const removed = photo.spaceIds.filter((s) => !spaceIds.includes(s));
  const added = spaceIds.filter((s) => !photo.spaceIds.includes(s));
  if (removed.length) await forgetPhotos(deps, [photoId], removed);
  if (added.length) deps.defer(updateDedupeForPhoto(deps, photoId, added));
  return { photoId, spaceIds, albumIds };
}

// ── 같은 파일이 이미 있을 때: 기존 사진에 공유 범위·앨범 더하기 ────

export async function addToExisting(
  deps: Deps,
  uid: string,
  photoId: string,
  req: { spaceIds: string[]; albumIds: string[] },
): Promise<{ photoId: string; added: string[]; pendingApproval: string[]; mergeRequestId: string | null }> {
  const photo = await requirePhoto(deps, photoId);
  const user = await requireUser(deps, uid);
  if (photo.status !== 'active' || (photo.ownerUid !== uid && !canView(photo, user.spaceIds))) {
    throw notFound('사진을 찾을 수 없어요', 'photo_not_found');
  }
  if (req.spaceIds.some((s) => !user.spaceIds.includes(s))) throw badRequest('내가 속한 공간만 고를 수 있어요', 'invalid_share');
  await validateAlbums(deps, req.albumIds, user, photo.albumIds);
  const albumIds = uniq([...photo.albumIds, ...req.albumIds]);

  if (photo.ownerUid === uid) {
    const spaceIds = normalizeShare([...photo.spaceIds, ...req.spaceIds], personalSpaceId(uid));
    await patchPhoto(deps, photoId, { spaceIds, albumIds });
    const added = spaceIds.filter((s) => !photo.spaceIds.includes(s));
    if (added.length) deps.defer(updateDedupeForPhoto(deps, photoId, added));
    return { photoId, added, pendingApproval: [], mergeRequestId: null };
  }

  // 다른 사람 사진: 앨범은 바로 넣고(보이는 범위는 그대로), 공간은 주인에게 확인을 받는다
  if (albumIds.length !== photo.albumIds.length) await patchPhoto(deps, photoId, { albumIds });
  const addSpaceIds = req.spaceIds.filter((s) => !photo.spaceIds.includes(s) && s !== user.personalSpaceId);
  if (!addSpaceIds.length) return { photoId, added: [], pendingApproval: [], mergeRequestId: null };
  const mr: StoredMergeRequest = {
    id: randomId(),
    groupId: null,
    photoId,
    ownerUid: photo.ownerUid,
    addSpaceIds,
    requestedBy: uid,
    status: 'pending',
    createdAt: deps.now(),
    removePhotoIds: [],
  };
  await deps.docs.commit([{ op: 'set', path: P.mergeRequest(mr.id), data: { ...mr } }]);
  deps.defer(
    pushToUsers(deps, [photo.ownerUid], {
      notification: { title: '사진 공유 확인', body: '가족이 내 사진을 다른 공간에도 보이게 하려고 해요' },
      data: { type: 'merge-request', photoId, mergeRequestId: mr.id },
    }),
  );
  return { photoId, added: [], pendingApproval: addSpaceIds, mergeRequestId: mr.id };
}

// ── 서명 주소 ────────────────────────────────────────

export async function photoUrls(deps: Deps, user: AuthUser, ids: readonly string[], variant: PhotoVariant): Promise<PhotoUrlsResponse> {
  const key = deps.cfg.secret('URL_SIGNING_KEY');
  const visible = await deps.index.visiblePhotoIds(ids, user.spaces, user.uid);
  const exp = photoUrlExpiry(deps.now());
  // 미리보기를 안 만든 사진(작은 사진 등)은 원본으로 대신한다
  const noPreview = new Set<string>();
  if (variant === 'preview' && visible.size) {
    for (const r of await deps.index.getPhotos([...visible])) if (!r.hasPreview) noPreview.add(r.photoId);
  }
  const urls: Record<string, string> = {};
  for (const id of ids) {
    if (!visible.has(id)) continue;
    urls[id] = await signPhotoUrl(deps.cfg.apiOrigin, key, id, noPreview.has(id) ? 'original' : variant, exp);
  }
  return { urls, expiresAt: exp };
}

// ── 휴지통 ───────────────────────────────────────────

/**
 * 올린 사람: 휴지통으로. spaceId를 주면 그 공간에서만 뺀다.
 * 공간 규칙이 '올린 사람과 관리자'면 그 공간 관리자도 그 공간에서만 뺄 수 있다.
 */
export async function trashPhoto(
  deps: Deps,
  uid: string,
  photoId: string,
  spaceId?: string,
): Promise<{ trashed: boolean; removedFromSpace: string | null }> {
  const photo = await requirePhoto(deps, photoId);
  if (photo.status === 'uploading') throw conflict('not_active', '올리는 중인 사진이에요');
  const ownerPersonal = personalSpaceId(photo.ownerUid);
  if (!spaceId || (photo.ownerUid === uid && photo.spaceIds.length <= 1)) {
    if (photo.ownerUid !== uid) throw forbidden('올린 사람만 지울 수 있어요');
    if (photo.status !== 'trashed') {
      await trashPhotos(deps, [photoId], uid);
      await forgetPhotos(deps, [photoId]);
    }
    return { trashed: true, removedFromSpace: null };
  }
  const space = await requireSpace(deps, spaceId);
  if (!canRemovePhotoFromSpace(photo, space, uid)) throw forbidden('이 공간에서 사진을 뺄 권한이 없어요');
  await patchPhoto(deps, photoId, { spaceIds: withoutSpace(photo.spaceIds, spaceId, ownerPersonal) });
  await forgetPhotos(deps, [photoId], [spaceId]);
  return { trashed: false, removedFromSpace: spaceId };
}

export async function restorePhoto(deps: Deps, uid: string, photoId: string): Promise<void> {
  const photo = await requirePhoto(deps, photoId);
  if (photo.ownerUid !== uid) throw forbidden('올린 사람만 되살릴 수 있어요');
  if (photo.status !== 'trashed') return;
  await patchPhoto(deps, photoId, { status: 'active', trashedAt: null, trashedBy: null });
  deps.defer(updateDedupeForPhoto(deps, photoId));
}
