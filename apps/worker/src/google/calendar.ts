// 사용자 Google OAuth(코드 교환·갱신·철회) + Google Calendar API v3
import { b64urlToBytes, utf8Decoder } from '../util/base64';
import { type Fetcher, GoogleApiError, googleJson } from './http';

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';

export interface GoogleTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string | null;
  scope: string;
  idToken: string | null;
}

export interface GEventTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface GEvent {
  id: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  summary?: string;
  description?: string;
  start?: GEventTime;
  end?: GEventTime;
  recurrence?: string[];
  recurringEventId?: string;
  extendedProperties?: { private?: Record<string, string> };
}

export interface GEventBody {
  summary: string;
  description: string;
  start: GEventTime;
  end: GEventTime;
  recurrence?: string[];
  reminders: { useDefault: boolean };
  extendedProperties: { private: Record<string, string> };
}

export interface EventPage {
  items: GEvent[];
  nextPageToken: string | null;
  nextSyncToken: string | null;
}

/** 구글 사용자 OAuth + 캘린더 호출 (테스트에서는 가짜로 바꾼다) */
export interface GoogleApi {
  exchangeCode(code: string, redirectUri: string): Promise<GoogleTokens>;
  refresh(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }>;
  revoke(token: string): Promise<void>;
  userEmail(accessToken: string, idToken: string | null): Promise<string | null>;

  createCalendar(accessToken: string, summary: string, timeZone: string): Promise<string>;
  calendarExists(accessToken: string, calendarId: string): Promise<boolean>;
  deleteCalendar(accessToken: string, calendarId: string): Promise<void>;
  insertEvent(accessToken: string, calendarId: string, body: GEventBody): Promise<GEvent>;
  /** 없으면(404/410) null */
  updateEvent(accessToken: string, calendarId: string, eventId: string, body: GEventBody): Promise<GEvent | null>;
  deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void>;
  /** syncToken이 만료되면 GoogleApiError(410) */
  listEvents(accessToken: string, calendarId: string, opts: { syncToken?: string | null; pageToken?: string | null }): Promise<EventPage>;
  watch(
    accessToken: string,
    calendarId: string,
    channel: { id: string; address: string; token: string; ttlSeconds: number },
  ): Promise<{ resourceId: string; expiration: number }>;
  stopChannel(accessToken: string, channel: { id: string; resourceId: string }): Promise<void>;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CAL = 'https://www.googleapis.com/calendar/v3';

/** id_token의 내용만 읽는다 (구글 토큰 엔드포인트에서 TLS로 직접 받은 값이라 서명 검증은 생략) */
export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const part = jwt.split('.')[1];
  if (!part) return null;
  try {
    return JSON.parse(utf8Decoder.decode(b64urlToBytes(part))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export class GoogleCalendarClient implements GoogleApi {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: () => string,
    private readonly fetcher: Fetcher,
  ) {}

  async exchangeCode(code: string, redirectUri: string): Promise<GoogleTokens> {
    const r = await googleJson<{
      access_token: string;
      expires_in: number;
      refresh_token?: string;
      scope?: string;
      id_token?: string;
    }>(this.fetcher, TOKEN_URL, {
      form: {
        grant_type: 'authorization_code',
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret(),
        // 안드로이드 serverAuthCode는 빈 문자열, 웹 GIS 코드 클라이언트는 'postmessage'
        redirect_uri: redirectUri,
      },
    });
    return {
      accessToken: r.access_token,
      expiresIn: r.expires_in,
      refreshToken: r.refresh_token ?? null,
      scope: r.scope ?? '',
      idToken: r.id_token ?? null,
    };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    const r = await googleJson<{ access_token: string; expires_in: number }>(this.fetcher, TOKEN_URL, {
      form: {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret(),
      },
    });
    return { accessToken: r.access_token, expiresIn: r.expires_in };
  }

  async revoke(token: string): Promise<void> {
    try {
      await googleJson(this.fetcher, 'https://oauth2.googleapis.com/revoke', { form: { token } });
    } catch (e) {
      // 이미 철회된 토큰
      if (e instanceof GoogleApiError && e.status === 400) return;
      throw e;
    }
  }

  async userEmail(accessToken: string, idToken: string | null): Promise<string | null> {
    if (idToken) {
      const email = decodeJwtPayload(idToken)?.email;
      if (typeof email === 'string') return email;
    }
    try {
      const r = await googleJson<{ email?: string }>(this.fetcher, 'https://www.googleapis.com/oauth2/v3/userinfo', {
        token: accessToken,
      });
      return r?.email ?? null;
    } catch {
      return null; // email 범위를 받지 않았으면 비워 둔다
    }
  }

  async createCalendar(accessToken: string, summary: string, timeZone: string): Promise<string> {
    const r = await googleJson<{ id: string }>(this.fetcher, `${CAL}/calendars`, {
      token: accessToken,
      body: { summary, timeZone, description: '한지붕 앱이 만든 캘린더입니다. 가족 일정·기념일이 자동으로 반영돼요.' },
    });
    return r.id;
  }

  async calendarExists(accessToken: string, calendarId: string): Promise<boolean> {
    try {
      await googleJson(this.fetcher, `${CAL}/calendars/${encodeURIComponent(calendarId)}`, { token: accessToken });
      return true;
    } catch (e) {
      if (e instanceof GoogleApiError && (e.status === 404 || e.status === 410)) return false;
      throw e;
    }
  }

  async deleteCalendar(accessToken: string, calendarId: string): Promise<void> {
    try {
      await googleJson(this.fetcher, `${CAL}/calendars/${encodeURIComponent(calendarId)}`, {
        method: 'DELETE',
        token: accessToken,
      });
    } catch (e) {
      if (e instanceof GoogleApiError && (e.status === 404 || e.status === 410)) return;
      throw e;
    }
  }

  private events(calendarId: string): string {
    return `${CAL}/calendars/${encodeURIComponent(calendarId)}/events`;
  }

  insertEvent(accessToken: string, calendarId: string, body: GEventBody): Promise<GEvent> {
    return googleJson<GEvent>(this.fetcher, this.events(calendarId), { token: accessToken, body });
  }

  async updateEvent(accessToken: string, calendarId: string, eventId: string, body: GEventBody): Promise<GEvent | null> {
    try {
      // PUT: 반복 규칙을 지울 때도 확실하게 덮어쓴다
      return await googleJson<GEvent>(this.fetcher, `${this.events(calendarId)}/${encodeURIComponent(eventId)}`, {
        method: 'PUT',
        token: accessToken,
        body: { ...body, status: 'confirmed' },
      });
    } catch (e) {
      if (e instanceof GoogleApiError && (e.status === 404 || e.status === 410)) return null;
      throw e;
    }
  }

  async deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
    try {
      await googleJson(this.fetcher, `${this.events(calendarId)}/${encodeURIComponent(eventId)}`, {
        method: 'DELETE',
        token: accessToken,
      });
    } catch (e) {
      if (e instanceof GoogleApiError && (e.status === 404 || e.status === 410)) return;
      throw e;
    }
  }

  async listEvents(
    accessToken: string,
    calendarId: string,
    opts: { syncToken?: string | null; pageToken?: string | null },
  ): Promise<EventPage> {
    const q = new URLSearchParams({ maxResults: '250', showDeleted: 'true' });
    if (opts.syncToken) q.set('syncToken', opts.syncToken);
    if (opts.pageToken) q.set('pageToken', opts.pageToken);
    const r = await googleJson<{ items?: GEvent[]; nextPageToken?: string; nextSyncToken?: string }>(
      this.fetcher,
      `${this.events(calendarId)}?${q}`,
      { token: accessToken },
    );
    return { items: r.items ?? [], nextPageToken: r.nextPageToken ?? null, nextSyncToken: r.nextSyncToken ?? null };
  }

  async watch(
    accessToken: string,
    calendarId: string,
    channel: { id: string; address: string; token: string; ttlSeconds: number },
  ): Promise<{ resourceId: string; expiration: number }> {
    const r = await googleJson<{ resourceId: string; expiration?: string }>(this.fetcher, `${this.events(calendarId)}/watch`, {
      token: accessToken,
      body: {
        id: channel.id,
        type: 'web_hook',
        address: channel.address,
        token: channel.token,
        params: { ttl: String(channel.ttlSeconds) },
      },
    });
    return { resourceId: r.resourceId, expiration: r.expiration ? Number(r.expiration) : Date.now() + channel.ttlSeconds * 1000 };
  }

  async stopChannel(accessToken: string, channel: { id: string; resourceId: string }): Promise<void> {
    try {
      await googleJson(this.fetcher, `${CAL}/channels/stop`, { token: accessToken, body: channel });
    } catch (e) {
      if (e instanceof GoogleApiError && (e.status === 404 || e.status === 410)) return;
      throw e;
    }
  }
}
