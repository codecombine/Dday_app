// 외부 서비스 가짜: 저장소, Firebase Auth, FCM, 구글 캘린더, 카카오
import type { KakaoApi, KakaoProfile } from '../../src/auth/kakao';
import { CALENDAR_SCOPE, type EventPage, type GEvent, type GEventBody, type GoogleApi, type GoogleTokens } from '../../src/google/calendar';
import type { PushMessage, PushResult, PushSender } from '../../src/google/fcm';
import { GoogleApiError } from '../../src/google/http';
import type { AuthAdmin, AuthUserRecord } from '../../src/google/identity';
import type { BlobInfo, BlobObject, BlobStore } from '../../src/storage/blob-store';

export class MemoryBlobStore implements BlobStore {
  objects = new Map<string, { bytes: Uint8Array; contentType: string }>();

  async put(key: string, body: ReadableStream | ArrayBuffer, opts: { contentType: string; size?: number }): Promise<void> {
    const bytes = new Uint8Array(body instanceof ArrayBuffer ? body : await new Response(body).arrayBuffer());
    if (opts.size !== undefined && bytes.length !== opts.size) throw new Error('길이가 다릅니다');
    this.objects.set(key, { bytes, contentType: opts.contentType });
  }
  async get(key: string): Promise<BlobObject | null> {
    const o = this.objects.get(key);
    if (!o) return null;
    return { body: new Response(o.bytes).body!, contentType: o.contentType, size: o.bytes.length };
  }
  async head(key: string): Promise<BlobInfo | null> {
    const o = this.objects.get(key);
    return o ? { contentType: o.contentType, size: o.bytes.length } : null;
  }
  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

export class FakeAuth implements AuthAdmin {
  claims = new Map<string, string[]>();
  users = new Map<string, { displayName: string | null }>();
  deleted: string[] = [];

  async setSpacesClaim(uid: string, spaceIds: readonly string[]): Promise<void> {
    this.claims.set(uid, [...spaceIds]);
  }
  async lookup(uid: string): Promise<AuthUserRecord | null> {
    const u = this.users.get(uid);
    return u ? { uid, displayName: u.displayName, email: null, customClaims: { spaces: this.claims.get(uid) ?? [] } } : null;
  }
  async ensureUser(uid: string, profile: { displayName?: string | null }): Promise<void> {
    if (!this.users.has(uid)) this.users.set(uid, { displayName: profile.displayName ?? null });
  }
  async deleteUser(uid: string): Promise<void> {
    this.users.delete(uid);
    this.deleted.push(uid);
  }
}

export class FakePush implements PushSender {
  sent: { token: string; msg: PushMessage }[] = [];
  unregistered = new Set<string>();

  async send(token: string, msg: PushMessage): Promise<PushResult> {
    if (this.unregistered.has(token)) return 'unregistered';
    this.sent.push({ token, msg });
    return 'ok';
  }
}

export class FakeKakao implements KakaoApi {
  async exchangeCode(code: string): Promise<string> {
    if (code === 'bad') throw new Error('invalid_grant');
    return `kakao-token-${code}`;
  }
  async verifyToken(accessToken: string): Promise<void> {
    if (accessToken === 'other-app') throw new Error('다른 카카오 앱의 토큰');
  }
  async me(accessToken: string): Promise<KakaoProfile> {
    if (accessToken === 'bad') throw new Error('401');
    return { id: '12345', nickname: '엄마', profileImage: null, email: null };
  }
}

interface Change {
  seq: number;
  calendarId: string;
  eventId: string;
}

/** 메모리 구글 캘린더. listEvents(syncToken)은 그 뒤에 바뀐 일정만 돌려준다 */
export class FakeGoogle implements GoogleApi {
  calendars = new Map<string, Map<string, GEvent>>();
  changes: Change[] = [];
  seq = 0;
  n = 0;
  calls: string[] = [];
  revoked: string[] = [];
  stopped: string[] = [];
  refreshFails = false;
  expiredSyncTokens = new Set<string>();

  private log(calendarId: string, eventId: string) {
    this.changes.push({ seq: ++this.seq, calendarId, eventId });
  }

  async exchangeCode(code: string): Promise<GoogleTokens> {
    this.calls.push('exchangeCode');
    if (code === 'bad') throw new GoogleApiError(400, 'invalid_grant', 'bad code', null);
    return { accessToken: 'access-1', expiresIn: 3600, refreshToken: code === 'no-refresh' ? null : 'refresh-1', scope: `openid email ${CALENDAR_SCOPE}`, idToken: null };
  }
  async refresh(): Promise<{ accessToken: string; expiresIn: number }> {
    this.calls.push('refresh');
    if (this.refreshFails) throw new GoogleApiError(400, 'invalid_grant', 'revoked', null);
    return { accessToken: 'access-2', expiresIn: 3600 };
  }
  async revoke(token: string): Promise<void> {
    this.revoked.push(token);
  }
  async userEmail(): Promise<string | null> {
    return 'family@example.com';
  }
  async createCalendar(): Promise<string> {
    const id = `cal-${++this.n}`;
    this.calendars.set(id, new Map());
    this.calls.push('createCalendar');
    return id;
  }
  async calendarExists(_t: string, calendarId: string): Promise<boolean> {
    return this.calendars.has(calendarId);
  }
  async deleteCalendar(_t: string, calendarId: string): Promise<void> {
    this.calendars.delete(calendarId);
  }
  private cal(calendarId: string): Map<string, GEvent> {
    const c = this.calendars.get(calendarId);
    if (!c) throw new GoogleApiError(404, 'notFound', 'no calendar', null);
    return c;
  }
  async insertEvent(_t: string, calendarId: string, body: GEventBody): Promise<GEvent> {
    this.calls.push('insert');
    const id = `ev-${++this.n}`;
    const ev: GEvent = { id, status: 'confirmed', ...structuredClone(body) };
    this.cal(calendarId).set(id, ev);
    this.log(calendarId, id);
    return structuredClone(ev);
  }
  async updateEvent(_t: string, calendarId: string, eventId: string, body: GEventBody): Promise<GEvent | null> {
    this.calls.push('update');
    const c = this.cal(calendarId);
    if (!c.has(eventId)) return null;
    const ev: GEvent = { id: eventId, status: 'confirmed', ...structuredClone(body) };
    c.set(eventId, ev);
    this.log(calendarId, eventId);
    return structuredClone(ev);
  }
  async deleteEvent(_t: string, calendarId: string, eventId: string): Promise<void> {
    this.calls.push('delete');
    const c = this.calendars.get(calendarId);
    const ev = c?.get(eventId);
    if (!c || !ev) return;
    c.set(eventId, { ...ev, status: 'cancelled' });
    this.log(calendarId, eventId);
  }
  async listEvents(_t: string, calendarId: string, opts: { syncToken?: string | null }): Promise<EventPage> {
    this.calls.push('list');
    if (opts.syncToken && this.expiredSyncTokens.has(opts.syncToken)) throw new GoogleApiError(410, 'fullSyncRequired', 'gone', null);
    const c = this.cal(calendarId);
    const since = opts.syncToken ? Number(opts.syncToken) : null;
    const ids =
      since === null
        ? [...c.keys()]
        : [...new Set(this.changes.filter((ch) => ch.calendarId === calendarId && ch.seq > since).map((ch) => ch.eventId))];
    const items = ids.map((id) => c.get(id)).filter((e): e is GEvent => !!e && (since !== null || e.status !== 'cancelled'));
    return { items: structuredClone(items), nextPageToken: null, nextSyncToken: String(this.seq) };
  }
  async watch(_t: string, _c: string, channel: { id: string; ttlSeconds: number }): Promise<{ resourceId: string; expiration: number }> {
    this.calls.push('watch');
    return { resourceId: `res-${channel.id}`, expiration: Date.UTC(2026, 9, 17) };
  }
  async stopChannel(_t: string, channel: { id: string }): Promise<void> {
    this.stopped.push(channel.id);
  }

  /** 시험용: 사용자가 구글 캘린더에서 직접 고친 것처럼 */
  userEdit(calendarId: string, eventId: string, patch: Partial<GEvent>): void {
    const c = this.cal(calendarId);
    const ev = c.get(eventId)!;
    c.set(eventId, { ...ev, ...structuredClone(patch) });
    this.log(calendarId, eventId);
  }

  events(calendarId: string): GEvent[] {
    return [...(this.calendars.get(calendarId)?.values() ?? [])].filter((e) => e.status !== 'cancelled');
  }
}
