// 사진: 올리기 준비·파일·완료·공유 범위·서명 주소·내려받기·휴지통
import type { PhotoSource, PhotoUrlsResponse, PhotoVariant, PreparePhotoInput, PreparePhotosResponse } from '@hanjibung/core';
import type { Hono } from 'hono';

import { badRequest, HttpError, notFound } from '../errors';
import type { AppEnv, Mw } from '../hono-env';
import { photoBlobKey } from '../storage/blob-store';
import { verifyPhotoUrl } from '../services/photo-urls';
import {
  addToExisting,
  commitPhoto,
  photoUrls,
  preparePhotos,
  restorePhoto,
  trashPhoto,
  type UpdatePhotoRequest,
  updatePhoto,
  uploadBlob,
} from '../services/photos';
import { bool, int, intOrNull, type Obj, oneOf, optStr, readJson, safeId, str, strArray, strOrNull } from '../util/validate';

const VARIANTS = ['original', 'preview', 'thumb'] as const;
const SOURCES: readonly PhotoSource[] = ['camera', 'kakao', 'screenshot', 'unknown'];

function parsePrepareInput(o: Obj): PreparePhotoInput {
  const sha256 = str(o, 'sha256', { min: 64, max: 64 });
  const phash = str(o, 'phash', { min: 16, max: 16 });
  if (!/^[0-9a-fA-F]{64}$/.test(sha256)) throw badRequest('파일 지문이 올바르지 않아요', 'invalid_field', { field: 'sha256' });
  if (!/^[0-9a-fA-F]{16}$/.test(phash)) throw badRequest('생김새 지문이 올바르지 않아요', 'invalid_field', { field: 'phash' });
  const mime = str(o, 'mime', { max: 100 });
  if (!/^image\/[a-z0-9.+-]+$/i.test(mime)) throw badRequest('사진 파일만 올릴 수 있어요', 'unsupported_type');
  return {
    sha256,
    phash,
    width: int(o, 'width', { min: 1, max: 100_000 }),
    height: int(o, 'height', { min: 1, max: 100_000 }),
    bytes: int(o, 'bytes', { min: 1 }),
    mime,
    hasExif: bool(o, 'hasExif'),
    takenAt: intOrNull(o, 'takenAt'),
    cameraModel: strOrNull(o, 'cameraModel', 100),
    source: oneOf(o, 'source', SOURCES),
    originalName: typeof o.originalName === 'string' ? o.originalName.slice(0, 255) : '',
  };
}

function contentDisposition(name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, '_') || 'photo';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name || 'photo')}`;
}

export function photoRoutes(app: Hono<AppEnv>, auth: Mw): void {
  app.post('/photos/prepare', auth, async (c) => {
    const body = await readJson(c);
    if (!Array.isArray(body.photos) || body.photos.length === 0 || body.photos.length > 100) {
      throw badRequest('사진은 한 번에 100장까지 확인할 수 있어요', 'invalid_field', { field: 'photos' });
    }
    const inputs = body.photos.map((p) => {
      if (!p || typeof p !== 'object') throw badRequest();
      return parsePrepareInput(p as Obj);
    });
    const photos = await preparePhotos(c.get('deps'), c.get('user'), inputs);
    return c.json<PreparePhotosResponse>({ photos });
  });

  app.put('/photos/:id/blob/:variant', auth, async (c) => {
    const id = safeId(c.req.param('id'));
    const variant = c.req.param('variant');
    if (!(VARIANTS as readonly string[]).includes(variant)) throw notFound();
    const len = c.req.header('Content-Length');
    const size = len && /^\d+$/.test(len) ? Number(len) : null;
    await uploadBlob(c.get('deps'), c.get('user').uid, id, variant as PhotoVariant, c.req.raw.body, size);
    return c.json({ ok: true });
  });

  app.post('/photos/:id/commit', auth, async (c) => {
    const body = await readJson(c);
    const res = await commitPhoto(c.get('deps'), c.get('user').uid, safeId(c.req.param('id')), {
      spaceIds: strArray(body, 'spaceIds', { max: 20 }),
      albumIds: strArray(body, 'albumIds', { max: 50, optional: true }),
      notify: bool(body, 'notify', false),
    });
    return c.json(res);
  });

  app.patch('/photos/:id', auth, async (c) => {
    const body = await readJson(c);
    const req: UpdatePhotoRequest = {};
    if (body.spaceIds !== undefined) req.spaceIds = strArray(body, 'spaceIds', { max: 20 });
    if (body.albumIds !== undefined) req.albumIds = strArray(body, 'albumIds', { max: 50 });
    if (!req.spaceIds && !req.albumIds) throw badRequest();
    return c.json(await updatePhoto(c.get('deps'), c.get('user').uid, safeId(c.req.param('id')), req));
  });

  app.post('/photos/:id/add', auth, async (c) => {
    const body = await readJson(c);
    const res = await addToExisting(c.get('deps'), c.get('user').uid, safeId(c.req.param('id')), {
      spaceIds: strArray(body, 'spaceIds', { max: 20, optional: true }),
      albumIds: strArray(body, 'albumIds', { max: 50, optional: true }),
    });
    return c.json(res);
  });

  app.post('/photos/urls', auth, async (c) => {
    const body = await readJson(c);
    const ids = strArray(body, 'ids', { max: 200, itemMax: 128 });
    const variant = oneOf(body, 'variant', VARIANTS);
    return c.json<PhotoUrlsResponse>(await photoUrls(c.get('deps'), c.get('user'), ids, variant));
  });

  app.post('/photos/:id/trash', auth, async (c) => {
    const body = await readJson(c, true);
    const spaceId = optStr(body, 'spaceId', { max: 128 });
    return c.json(await trashPhoto(c.get('deps'), c.get('user').uid, safeId(c.req.param('id')), spaceId ? safeId(spaceId, 'spaceId') : undefined));
  });

  app.post('/photos/:id/restore', auth, async (c) => {
    await restorePhoto(c.get('deps'), c.get('user').uid, safeId(c.req.param('id')));
    return c.json({ ok: true });
  });

  // 서명 주소로 받는 사진 파일 (로그인 토큰 대신 서명으로 인증)
  app.get('/b/:id/:variant', async (c) => {
    const deps = c.get('deps');
    const id = c.req.param('id');
    const variant = c.req.param('variant');
    const check = await verifyPhotoUrl(deps.cfg.secret('URL_SIGNING_KEY'), id, variant, c.req.query('exp'), c.req.query('sig'), deps.now());
    if (check === 'expired') throw new HttpError(410, 'url_expired', '주소가 만료됐어요. 새로고침해 주세요');
    if (check !== 'ok') throw new HttpError(403, 'invalid_signature', '사진을 볼 수 없어요');
    const obj = await deps.blobs.get(photoBlobKey(id, variant as PhotoVariant));
    if (!obj) throw notFound('사진 파일이 없어요', 'blob_not_found');
    const headers = new Headers({
      'Content-Type': obj.contentType,
      'Content-Length': String(obj.size),
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    if (c.req.query('dl') === '1') {
      const row = await deps.index.getPhoto(id);
      headers.set('Content-Disposition', contentDisposition(row?.originalName || `${id}.jpg`));
    }
    return new Response(obj.body, { status: 200, headers });
  });
}
