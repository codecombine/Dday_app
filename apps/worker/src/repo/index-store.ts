// D1 접근 계층 (Worker 전용 데이터: 초대, 사진 지문, 구글 연결, 캘린더 매핑, 정기 작업 상태)
import { type Millis, type PhotoSource, type PhotoStatus, type PhotoVariant, phashBands } from '@hanjibung/core';

export interface Invite {
  token: string;
  spaceId: string;
  createdBy: string;
  targetMemberId: string | null;
  expiresAt: Millis;
  revoked: boolean;
  uses: number;
  createdAt: Millis;
}

export interface PhotoIndexRow {
  photoId: string;
  ownerUid: string;
  spaceIds: string[];
  sha256: string;
  phash: string;
  width: number;
  height: number;
  bytes: number;
  hasExif: boolean;
  takenAt: Millis | null;
  source: PhotoSource;
  mime: string;
  originalName: string;
  status: PhotoStatus;
  hasOriginal: boolean;
  hasPreview: boolean;
  hasThumb: boolean;
  trashedAt: Millis | null;
  createdAt: Millis;
}

export type PhotoIndexPatch = Partial<
  Pick<PhotoIndexRow, 'ownerUid' | 'spaceIds' | 'bytes' | 'takenAt' | 'status' | 'trashedAt'>
>;

export interface GoogleAccount {
  uid: string;
  email: string | null;
  refreshTokenEnc: string;
  calendarId: string | null;
  /** 빈 배열 = 내 공간 전체 */
  mirrorSpaceIds: string[];
  channelId: string | null;
  channelResourceId: string | null;
  channelExpiresAt: Millis | null;
  syncToken: string | null;
  fullSyncPending: boolean;
  lastFullSyncAt: Millis | null;
  updatedAt: Millis;
}

export interface CalendarLink {
  uid: string;
  itemId: string;
  occurrenceKey: string;
  googleEventId: string;
  itemUpdatedAt: Millis;
}

export interface PhotoNotice {
  photoId: string;
  uid: string;
  spaceIds: string[];
  createdAt: Millis;
}

export interface IndexStore {
  // 초대
  insertInvite(inv: Invite): Promise<void>;
  getInvite(token: string): Promise<Invite | null>;
  revokeInvite(token: string): Promise<void>;
  bumpInviteUses(token: string): Promise<void>;
  deleteInvitesForSpace(spaceId: string): Promise<void>;
  deleteInvitesExpiredBefore(ms: Millis): Promise<number>;

  // 사진 지문
  insertPhoto(row: PhotoIndexRow): Promise<void>;
  getPhoto(id: string): Promise<PhotoIndexRow | null>;
  getPhotos(ids: readonly string[]): Promise<PhotoIndexRow[]>;
  updatePhoto(id: string, patch: PhotoIndexPatch): Promise<void>;
  markVariant(id: string, variant: PhotoVariant): Promise<void>;
  deletePhoto(id: string): Promise<void>;
  /** 볼 수 있는 같은 파일(active) 또는 내가 올리다 만 같은 파일(uploading) */
  findSameFile(sha256: string, spaceIds: readonly string[], uid: string): Promise<{ activeId: string | null; pendingId: string | null }>;
  /** 같은 공간의 active 사진 중 SHA-256이나 pHash 조각이 하나라도 같은 것 */
  findDedupeCandidates(spaceId: string, photo: Pick<PhotoIndexRow, 'photoId' | 'sha256' | 'phash'>, limit?: number): Promise<PhotoIndexRow[]>;
  listSpacePhotos(spaceId: string, status?: PhotoStatus): Promise<PhotoIndexRow[]>;
  countSpacePhotos(spaceId: string): Promise<number>;
  /** ids 중 볼 수 있는 것: active이면서 내 공간에 있거나, 내 사진 */
  visiblePhotoIds(ids: readonly string[], spaceIds: readonly string[], uid: string): Promise<Set<string>>;
  listOwnerPhotos(uid: string): Promise<PhotoIndexRow[]>;
  listOwnerPhotosInSpace(uid: string, spaceId: string): Promise<PhotoIndexRow[]>;
  listTrashedBefore(ms: Millis, limit: number): Promise<PhotoIndexRow[]>;
  listStaleUploads(createdBefore: Millis, limit: number): Promise<PhotoIndexRow[]>;

  // 묶음 사진 알림
  addNotice(n: PhotoNotice): Promise<void>;
  listNotices(uid: string): Promise<PhotoNotice[]>;
  listNoticeUidsBefore(ms: Millis): Promise<string[]>;
  deleteNotices(photoIds: readonly string[]): Promise<void>;

  // 구글 캘린더
  getGoogleAccount(uid: string): Promise<GoogleAccount | null>;
  getGoogleAccountByChannel(channelId: string): Promise<GoogleAccount | null>;
  listGoogleAccounts(): Promise<GoogleAccount[]>;
  upsertGoogleAccount(acc: GoogleAccount): Promise<void>;
  patchGoogleAccount(uid: string, patch: Partial<Omit<GoogleAccount, 'uid'>>): Promise<void>;
  deleteGoogleAccount(uid: string): Promise<void>;

  listLinksByItem(itemId: string): Promise<CalendarLink[]>;
  listLinksByUser(uid: string): Promise<CalendarLink[]>;
  getLinkByEvent(uid: string, googleEventId: string): Promise<CalendarLink | null>;
  upsertLink(link: CalendarLink): Promise<void>;
  deleteLink(uid: string, itemId: string, occurrenceKey: string): Promise<void>;
  deleteLinksByUser(uid: string): Promise<void>;
  listLinkedItemIds(afterItemId: string, limit: number): Promise<string[]>;

  // 정기 작업 상태
  getState(key: string): Promise<string | null>;
  setState(key: string, value: string): Promise<void>;
}

// ── D1 구현 ──────────────────────────────────────────

type Row = Record<string, unknown>;

const json = (v: unknown): string => JSON.stringify(v ?? []);
const parseArr = (v: unknown): string[] => {
  if (typeof v !== 'string') return [];
  try {
    const a = JSON.parse(v) as unknown;
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

function toInvite(r: Row): Invite {
  return {
    token: String(r.token),
    spaceId: String(r.space_id),
    createdBy: String(r.created_by),
    targetMemberId: strOrNull(r.target_member_id),
    expiresAt: Number(r.expires_at),
    revoked: Number(r.revoked) === 1,
    uses: Number(r.uses),
    createdAt: Number(r.created_at),
  };
}

function toPhoto(r: Row): PhotoIndexRow {
  return {
    photoId: String(r.photo_id),
    ownerUid: String(r.owner_uid),
    spaceIds: parseArr(r.space_ids),
    sha256: String(r.sha256),
    phash: String(r.phash),
    width: Number(r.width),
    height: Number(r.height),
    bytes: Number(r.bytes),
    hasExif: Number(r.has_exif) === 1,
    takenAt: numOrNull(r.taken_at),
    source: String(r.source) as PhotoSource,
    mime: String(r.mime),
    originalName: String(r.original_name ?? ''),
    status: String(r.status) as PhotoStatus,
    hasOriginal: Number(r.has_original) === 1,
    hasPreview: Number(r.has_preview) === 1,
    hasThumb: Number(r.has_thumb) === 1,
    trashedAt: numOrNull(r.trashed_at),
    createdAt: Number(r.created_at),
  };
}

function toAccount(r: Row): GoogleAccount {
  return {
    uid: String(r.uid),
    email: strOrNull(r.email),
    refreshTokenEnc: String(r.refresh_token_enc),
    calendarId: strOrNull(r.calendar_id),
    mirrorSpaceIds: parseArr(r.mirror_space_ids),
    channelId: strOrNull(r.channel_id),
    channelResourceId: strOrNull(r.channel_resource_id),
    channelExpiresAt: numOrNull(r.channel_expires_at),
    syncToken: strOrNull(r.sync_token),
    fullSyncPending: Number(r.full_sync_pending) === 1,
    lastFullSyncAt: numOrNull(r.last_full_sync_at),
    updatedAt: Number(r.updated_at),
  };
}

function toLink(r: Row): CalendarLink {
  return {
    uid: String(r.uid),
    itemId: String(r.item_id),
    occurrenceKey: String(r.occurrence_key),
    googleEventId: String(r.google_event_id),
    itemUpdatedAt: Number(r.item_updated_at),
  };
}

const ACCOUNT_COLUMNS: Record<keyof Omit<GoogleAccount, 'uid'>, string> = {
  email: 'email',
  refreshTokenEnc: 'refresh_token_enc',
  calendarId: 'calendar_id',
  mirrorSpaceIds: 'mirror_space_ids',
  channelId: 'channel_id',
  channelResourceId: 'channel_resource_id',
  channelExpiresAt: 'channel_expires_at',
  syncToken: 'sync_token',
  fullSyncPending: 'full_sync_pending',
  lastFullSyncAt: 'last_full_sync_at',
  updatedAt: 'updated_at',
};

function accountValue(key: keyof Omit<GoogleAccount, 'uid'>, v: unknown): unknown {
  if (key === 'mirrorSpaceIds') return json(v);
  if (key === 'fullSyncPending') return v ? 1 : 0;
  return v ?? null;
}

export class D1IndexStore implements IndexStore {
  constructor(private readonly db: D1Database) {}

  private async all(sql: string, ...params: unknown[]): Promise<Row[]> {
    const r = await this.db.prepare(sql).bind(...params).all<Row>();
    return r.results ?? [];
  }

  private async first(sql: string, ...params: unknown[]): Promise<Row | null> {
    return (await this.db.prepare(sql).bind(...params).first<Row>()) ?? null;
  }

  private async run(sql: string, ...params: unknown[]): Promise<number> {
    const r = await this.db.prepare(sql).bind(...params).run();
    return r.meta?.changes ?? 0;
  }

  // 초대
  async insertInvite(i: Invite): Promise<void> {
    await this.run(
      'INSERT INTO invites (token, space_id, created_by, target_member_id, expires_at, revoked, uses, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      i.token, i.spaceId, i.createdBy, i.targetMemberId, i.expiresAt, i.revoked ? 1 : 0, i.uses, i.createdAt,
    );
  }
  async getInvite(token: string): Promise<Invite | null> {
    const r = await this.first('SELECT * FROM invites WHERE token = ?', token);
    return r ? toInvite(r) : null;
  }
  async revokeInvite(token: string): Promise<void> {
    await this.run('UPDATE invites SET revoked = 1 WHERE token = ?', token);
  }
  async bumpInviteUses(token: string): Promise<void> {
    await this.run('UPDATE invites SET uses = uses + 1 WHERE token = ?', token);
  }
  async deleteInvitesForSpace(spaceId: string): Promise<void> {
    await this.run('DELETE FROM invites WHERE space_id = ?', spaceId);
  }
  async deleteInvitesExpiredBefore(ms: Millis): Promise<number> {
    return this.run('DELETE FROM invites WHERE expires_at < ?', ms);
  }

  // 사진 지문
  async insertPhoto(p: PhotoIndexRow): Promise<void> {
    const b = phashBands(p.phash);
    const stmts = [
      this.db
        .prepare(
          `INSERT INTO photo_fp (photo_id, owner_uid, space_ids, sha256, phash, b0, b1, b2, b3, b4, b5, b6, b7,
             width, height, bytes, has_exif, taken_at, source, mime, original_name, status,
             has_original, has_preview, has_thumb, trashed_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          p.photoId, p.ownerUid, json(p.spaceIds), p.sha256, p.phash,
          b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
          p.width, p.height, p.bytes, p.hasExif ? 1 : 0, p.takenAt, p.source, p.mime, p.originalName, p.status,
          p.hasOriginal ? 1 : 0, p.hasPreview ? 1 : 0, p.hasThumb ? 1 : 0, p.trashedAt, p.createdAt,
        ),
      ...p.spaceIds.map((s) => this.db.prepare('INSERT OR IGNORE INTO photo_space (photo_id, space_id) VALUES (?, ?)').bind(p.photoId, s)),
    ];
    await this.db.batch(stmts);
  }
  async getPhoto(id: string): Promise<PhotoIndexRow | null> {
    const r = await this.first('SELECT * FROM photo_fp WHERE photo_id = ?', id);
    return r ? toPhoto(r) : null;
  }
  async getPhotos(ids: readonly string[]): Promise<PhotoIndexRow[]> {
    if (!ids.length) return [];
    const rows = await this.all('SELECT * FROM photo_fp WHERE photo_id IN (SELECT value FROM json_each(?))', json(ids));
    return rows.map(toPhoto);
  }
  async updatePhoto(id: string, patch: PhotoIndexPatch): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, v: unknown) => {
      sets.push(`${col} = ?`);
      params.push(v);
    };
    if (patch.ownerUid !== undefined) add('owner_uid', patch.ownerUid);
    if (patch.spaceIds !== undefined) add('space_ids', json(patch.spaceIds));
    if (patch.bytes !== undefined) add('bytes', patch.bytes);
    if (patch.takenAt !== undefined) add('taken_at', patch.takenAt);
    if (patch.status !== undefined) add('status', patch.status);
    if (patch.trashedAt !== undefined) add('trashed_at', patch.trashedAt);
    const stmts: D1PreparedStatement[] = [];
    if (sets.length) stmts.push(this.db.prepare(`UPDATE photo_fp SET ${sets.join(', ')} WHERE photo_id = ?`).bind(...params, id));
    if (patch.spaceIds !== undefined) {
      stmts.push(this.db.prepare('DELETE FROM photo_space WHERE photo_id = ?').bind(id));
      for (const s of patch.spaceIds) {
        stmts.push(this.db.prepare('INSERT OR IGNORE INTO photo_space (photo_id, space_id) VALUES (?, ?)').bind(id, s));
      }
    }
    if (stmts.length) await this.db.batch(stmts);
  }
  async markVariant(id: string, variant: PhotoVariant): Promise<void> {
    const col = variant === 'original' ? 'has_original' : variant === 'preview' ? 'has_preview' : 'has_thumb';
    await this.run(`UPDATE photo_fp SET ${col} = 1 WHERE photo_id = ?`, id);
  }
  async deletePhoto(id: string): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM photo_space WHERE photo_id = ?').bind(id),
      this.db.prepare('DELETE FROM photo_fp WHERE photo_id = ?').bind(id),
      this.db.prepare('DELETE FROM photo_notices WHERE photo_id = ?').bind(id),
    ]);
  }
  async findSameFile(sha256: string, spaceIds: readonly string[], uid: string) {
    const rows = await this.all(
      `SELECT f.photo_id, f.status FROM photo_fp f
        WHERE f.sha256 = ?1 AND (
          (f.status = 'active' AND EXISTS (
             SELECT 1 FROM photo_space s WHERE s.photo_id = f.photo_id AND s.space_id IN (SELECT value FROM json_each(?2))))
          OR (f.status = 'uploading' AND f.owner_uid = ?3))
        ORDER BY f.created_at ASC`,
      sha256, json(spaceIds), uid,
    );
    const active = rows.find((r) => r.status === 'active');
    const pending = rows.find((r) => r.status === 'uploading');
    return { activeId: active ? String(active.photo_id) : null, pendingId: pending ? String(pending.photo_id) : null };
  }
  async findDedupeCandidates(spaceId: string, photo: Pick<PhotoIndexRow, 'photoId' | 'sha256' | 'phash'>, limit = 500) {
    const b = phashBands(photo.phash);
    const rows = await this.all(
      `SELECT f.* FROM photo_space s JOIN photo_fp f ON f.photo_id = s.photo_id
        WHERE s.space_id = ? AND f.status = 'active' AND f.photo_id != ?
          AND (f.sha256 = ? OR f.b0 = ? OR f.b1 = ? OR f.b2 = ? OR f.b3 = ? OR f.b4 = ? OR f.b5 = ? OR f.b6 = ? OR f.b7 = ?)
        LIMIT ?`,
      spaceId, photo.photoId, photo.sha256, b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], limit,
    );
    return rows.map(toPhoto);
  }
  async listSpacePhotos(spaceId: string, status?: PhotoStatus): Promise<PhotoIndexRow[]> {
    const rows = status
      ? await this.all(
          'SELECT f.* FROM photo_space s JOIN photo_fp f ON f.photo_id = s.photo_id WHERE s.space_id = ? AND f.status = ?',
          spaceId, status,
        )
      : await this.all('SELECT f.* FROM photo_space s JOIN photo_fp f ON f.photo_id = s.photo_id WHERE s.space_id = ?', spaceId);
    return rows.map(toPhoto);
  }
  async countSpacePhotos(spaceId: string): Promise<number> {
    const r = await this.first(
      `SELECT COUNT(*) AS n FROM photo_space s JOIN photo_fp f ON f.photo_id = s.photo_id WHERE s.space_id = ? AND f.status = 'active'`,
      spaceId,
    );
    return Number(r?.n ?? 0);
  }
  async visiblePhotoIds(ids: readonly string[], spaceIds: readonly string[], uid: string): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const rows = await this.all(
      `SELECT f.photo_id FROM photo_fp f
        WHERE f.photo_id IN (SELECT value FROM json_each(?1))
          AND (f.owner_uid = ?3 OR (f.status = 'active' AND EXISTS (
            SELECT 1 FROM photo_space s WHERE s.photo_id = f.photo_id AND s.space_id IN (SELECT value FROM json_each(?2)))))`,
      json(ids), json(spaceIds), uid,
    );
    return new Set(rows.map((r) => String(r.photo_id)));
  }
  async listOwnerPhotos(uid: string): Promise<PhotoIndexRow[]> {
    return (await this.all('SELECT * FROM photo_fp WHERE owner_uid = ?', uid)).map(toPhoto);
  }
  async listOwnerPhotosInSpace(uid: string, spaceId: string): Promise<PhotoIndexRow[]> {
    const rows = await this.all(
      'SELECT f.* FROM photo_space s JOIN photo_fp f ON f.photo_id = s.photo_id WHERE s.space_id = ? AND f.owner_uid = ?',
      spaceId, uid,
    );
    return rows.map(toPhoto);
  }
  async listTrashedBefore(ms: Millis, limit: number): Promise<PhotoIndexRow[]> {
    const rows = await this.all(
      `SELECT * FROM photo_fp WHERE status = 'trashed' AND trashed_at IS NOT NULL AND trashed_at < ? LIMIT ?`,
      ms, limit,
    );
    return rows.map(toPhoto);
  }
  async listStaleUploads(createdBefore: Millis, limit: number): Promise<PhotoIndexRow[]> {
    const rows = await this.all(`SELECT * FROM photo_fp WHERE status = 'uploading' AND created_at < ? LIMIT ?`, createdBefore, limit);
    return rows.map(toPhoto);
  }

  // 묶음 사진 알림
  async addNotice(n: PhotoNotice): Promise<void> {
    await this.run(
      'INSERT OR REPLACE INTO photo_notices (photo_id, uid, space_ids, created_at) VALUES (?, ?, ?, ?)',
      n.photoId, n.uid, json(n.spaceIds), n.createdAt,
    );
  }
  async listNotices(uid: string): Promise<PhotoNotice[]> {
    const rows = await this.all('SELECT * FROM photo_notices WHERE uid = ? ORDER BY created_at', uid);
    return rows.map((r) => ({ photoId: String(r.photo_id), uid: String(r.uid), spaceIds: parseArr(r.space_ids), createdAt: Number(r.created_at) }));
  }
  async listNoticeUidsBefore(ms: Millis): Promise<string[]> {
    const rows = await this.all('SELECT uid, MAX(created_at) AS last FROM photo_notices GROUP BY uid HAVING last < ?', ms);
    return rows.map((r) => String(r.uid));
  }
  async deleteNotices(photoIds: readonly string[]): Promise<void> {
    if (!photoIds.length) return;
    await this.run('DELETE FROM photo_notices WHERE photo_id IN (SELECT value FROM json_each(?))', json(photoIds));
  }

  // 구글 캘린더
  async getGoogleAccount(uid: string): Promise<GoogleAccount | null> {
    const r = await this.first('SELECT * FROM google_accounts WHERE uid = ?', uid);
    return r ? toAccount(r) : null;
  }
  async getGoogleAccountByChannel(channelId: string): Promise<GoogleAccount | null> {
    const r = await this.first('SELECT * FROM google_accounts WHERE channel_id = ?', channelId);
    return r ? toAccount(r) : null;
  }
  async listGoogleAccounts(): Promise<GoogleAccount[]> {
    return (await this.all('SELECT * FROM google_accounts')).map(toAccount);
  }
  async upsertGoogleAccount(a: GoogleAccount): Promise<void> {
    await this.run(
      `INSERT OR REPLACE INTO google_accounts (uid, email, refresh_token_enc, calendar_id, mirror_space_ids, channel_id,
         channel_resource_id, channel_expires_at, sync_token, full_sync_pending, last_full_sync_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      a.uid, a.email, a.refreshTokenEnc, a.calendarId, json(a.mirrorSpaceIds), a.channelId, a.channelResourceId,
      a.channelExpiresAt, a.syncToken, a.fullSyncPending ? 1 : 0, a.lastFullSyncAt, a.updatedAt,
    );
  }
  async patchGoogleAccount(uid: string, patch: Partial<Omit<GoogleAccount, 'uid'>>): Promise<void> {
    const keys = Object.keys(patch) as (keyof Omit<GoogleAccount, 'uid'>)[];
    if (!keys.length) return;
    const sets = keys.map((k) => `${ACCOUNT_COLUMNS[k]} = ?`);
    const params = keys.map((k) => accountValue(k, patch[k]));
    await this.run(`UPDATE google_accounts SET ${sets.join(', ')} WHERE uid = ?`, ...params, uid);
  }
  async deleteGoogleAccount(uid: string): Promise<void> {
    await this.run('DELETE FROM google_accounts WHERE uid = ?', uid);
  }

  async listLinksByItem(itemId: string): Promise<CalendarLink[]> {
    return (await this.all('SELECT * FROM calendar_events WHERE item_id = ?', itemId)).map(toLink);
  }
  async listLinksByUser(uid: string): Promise<CalendarLink[]> {
    return (await this.all('SELECT * FROM calendar_events WHERE uid = ?', uid)).map(toLink);
  }
  async getLinkByEvent(uid: string, googleEventId: string): Promise<CalendarLink | null> {
    const r = await this.first('SELECT * FROM calendar_events WHERE uid = ? AND google_event_id = ?', uid, googleEventId);
    return r ? toLink(r) : null;
  }
  async upsertLink(l: CalendarLink): Promise<void> {
    await this.run(
      'INSERT OR REPLACE INTO calendar_events (uid, item_id, occurrence_key, google_event_id, item_updated_at) VALUES (?, ?, ?, ?, ?)',
      l.uid, l.itemId, l.occurrenceKey, l.googleEventId, l.itemUpdatedAt,
    );
  }
  async deleteLink(uid: string, itemId: string, occurrenceKey: string): Promise<void> {
    await this.run('DELETE FROM calendar_events WHERE uid = ? AND item_id = ? AND occurrence_key = ?', uid, itemId, occurrenceKey);
  }
  async deleteLinksByUser(uid: string): Promise<void> {
    await this.run('DELETE FROM calendar_events WHERE uid = ?', uid);
  }
  async listLinkedItemIds(afterItemId: string, limit: number): Promise<string[]> {
    const rows = await this.all(
      'SELECT DISTINCT item_id FROM calendar_events WHERE item_id > ? ORDER BY item_id LIMIT ?',
      afterItemId, limit,
    );
    return rows.map((r) => String(r.item_id));
  }

  // 정기 작업 상태
  async getState(key: string): Promise<string | null> {
    const r = await this.first('SELECT value FROM sync_state WHERE key = ?', key);
    return r ? String(r.value) : null;
  }
  async setState(key: string, value: string): Promise<void> {
    await this.run('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)', key, value);
  }
}
