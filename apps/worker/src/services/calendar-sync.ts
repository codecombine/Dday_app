// 구글 캘린더 실시간 동기화 (명세서 10장)
// 앱 → 구글: 항목이 바뀌면 볼 수 있는 연결 사용자마다 "한지붕" 캘린더 일정을 넣고·고치고·지운다.
// 구글 → 앱: 변경 알림(webhook) → events.list(syncToken) → 수정 권한이 있으면 항목에 반영, 없으면 되돌린다.
import {
  addDays,
  type CalendarEntry,
  calendarEntries,
  canEditItem,
  type GoogleConnectRequest,
  type GoogleStatus,
  type Item,
  type UserDoc,
} from '@hanjibung/core';

import type { Deps } from '../deps';
import { badRequest } from '../errors';
import { CALENDAR_SCOPE, type GEvent, type GEventBody } from '../google/calendar';
import { GoogleApiError } from '../google/http';
import { P, queryContainsAny } from '../repo/docstore';
import type { CalendarLink, GoogleAccount } from '../repo/index-store';
import { decryptToken, encryptToken, hmacHex, hmacVerifyHex } from '../util/crypto';
import { DAY, seoulDateTime, seoulToday } from '../util/time';
import { getItem, getUser, requireUser, uniq } from './common';
import { pushToUsers, silent } from './notify';

export const CALENDAR_NAME = '한지붕';
export const TIME_ZONE = 'Asia/Seoul';
const CHANNEL_TTL_SECONDS = 7 * 24 * 3600;
/** 구글에서 사용자가 지운 일정 표시 (다시 넣지 않는다) */
export const DELETED_EVENT = '-';

// ── 순수 함수 ────────────────────────────────────────

export interface CalendarPlan {
  inserts: CalendarEntry[];
  updates: { entry: CalendarEntry; link: CalendarLink }[];
  deletes: CalendarLink[];
  /** 구글 호출 없이 매핑만 지울 것 (지운 표시가 남은 일정이 더는 필요 없을 때) */
  drops: CalendarLink[];
}

/**
 * 원하는 일정 목록과 기존 매핑을 비교해 넣을 것·고칠 것·지울 것을 정한다.
 * 같은 키의 매핑이 있고 항목 updatedAt이 같으면 그대로 둔다 (force면 모두 고친다).
 */
export function planCalendarSync(
  desired: readonly CalendarEntry[],
  existing: readonly CalendarLink[],
  itemUpdatedAt: number,
  force = false,
): CalendarPlan {
  const byKey = new Map(existing.map((l) => [l.occurrenceKey, l]));
  const keys = new Set<string>();
  const plan: CalendarPlan = { inserts: [], updates: [], deletes: [], drops: [] };
  for (const e of desired) {
    if (keys.has(e.key)) continue;
    keys.add(e.key);
    const link = byKey.get(e.key);
    if (!link) plan.inserts.push(e);
    else if (link.googleEventId === DELETED_EVENT) continue;
    else if (force || link.itemUpdatedAt !== itemUpdatedAt) plan.updates.push({ entry: e, link });
  }
  for (const l of existing) {
    if (keys.has(l.occurrenceKey)) continue;
    if (l.googleEventId === DELETED_EVENT) plan.drops.push(l);
    else plan.deletes.push(l);
  }
  return plan;
}

export const planSize = (p: CalendarPlan) => p.inserts.length + p.updates.length + p.deletes.length;

export interface Schedule {
  allDay: boolean;
  startDate: string;
  startTime: string | null;
  /** 종일은 마지막 날(포함), 시각 일정은 종료 날짜 */
  endDate: string;
  endTime: string | null;
}

function entrySchedule(e: CalendarEntry): Schedule {
  if (e.allDay) return { allDay: true, startDate: e.startDate, startTime: null, endDate: e.endDate < e.startDate ? e.startDate : e.endDate, endTime: null };
  const startTime = e.startTime ?? '00:00';
  let endDate = e.endDate;
  let endTime = e.endTime ?? startTime;
  if (`${endDate}T${endTime}` < `${e.startDate}T${startTime}`) {
    endDate = e.startDate;
    endTime = startTime;
  }
  return { allDay: false, startDate: e.startDate, startTime, endDate, endTime };
}

export function entryToEventBody(e: CalendarEntry, itemId: string): GEventBody {
  const s = entrySchedule(e);
  const body: GEventBody = {
    summary: e.title,
    description: e.description,
    start: s.allDay ? { date: s.startDate } : { dateTime: `${s.startDate}T${s.startTime}:00`, timeZone: TIME_ZONE },
    end: s.allDay ? { date: addDays(s.endDate, 1) } : { dateTime: `${s.endDate}T${s.endTime}:00`, timeZone: TIME_ZONE },
    // 앱이 로컬 알림을 보내므로 구글 알림은 끈다 (중복 방지)
    reminders: { useDefault: false },
    extendedProperties: { private: { hjItemId: itemId, hjKey: e.key } },
  };
  if (e.rrule) body.recurrence = [`RRULE:${e.rrule}`];
  return body;
}

/** 구글 일정의 날짜·시각을 한국 시간 기준으로 읽는다 */
export function eventSchedule(ev: Pick<GEvent, 'start' | 'end'>): Schedule | null {
  if (ev.start?.date) {
    const startDate = ev.start.date;
    const endExclusive = ev.end?.date ?? addDays(startDate, 1);
    const last = addDays(endExclusive, -1);
    return { allDay: true, startDate, startTime: null, endDate: last < startDate ? startDate : last, endTime: null };
  }
  if (ev.start?.dateTime) {
    const s = Date.parse(ev.start.dateTime);
    const e = ev.end?.dateTime ? Date.parse(ev.end.dateTime) : s;
    if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
    const st = seoulDateTime(s);
    const en = seoulDateTime(Math.max(s, e));
    return { allDay: false, startDate: st.date, startTime: st.time, endDate: en.date, endTime: en.time };
  }
  return null;
}

/** 앱이 보낸 그대로인지 (변경 알림의 메아리 거르기) */
export function eventMatchesEntry(ev: GEvent, e: CalendarEntry): boolean {
  const a = eventSchedule(ev);
  if (!a) return false;
  const b = entrySchedule(e);
  return (
    (ev.summary ?? '').trim() === e.title.trim() &&
    a.allDay === b.allDay &&
    a.startDate === b.startDate &&
    a.startTime === b.startTime &&
    a.endDate === b.endDate &&
    a.endTime === b.endTime
  );
}

/** 구글에서 고친 내용을 항목에 되돌려 넣을 수 있는 경우: 반복 없는 단일 일정('base')만 */
export function canMapBack(item: Pick<Item, 'repeat' | 'lunar'>, entry: CalendarEntry): boolean {
  return entry.key === 'base' && entry.rrule === null && item.repeat === 'none' && !item.lunar;
}

/** 구글 일정 → 항목 수정 내용 (제목·날짜·시각) */
export function itemPatchFromEvent(ev: GEvent, item: Pick<Item, 'title' | 'kind'>): Partial<Item> | null {
  const s = eventSchedule(ev);
  if (!s) return null;
  const title = (ev.summary ?? '').trim().slice(0, 60) || item.title;
  if (item.kind === 'anniversary') return { title, date: s.startDate };
  const multiDay = s.endDate !== s.startDate;
  return {
    title,
    allDay: s.allDay,
    date: s.startDate,
    time: s.allDay ? null : s.startTime,
    endDate: multiDay ? s.endDate : null,
    endTime: s.allDay ? null : multiDay || s.endTime !== s.startTime ? s.endTime : null,
  };
}

export function mirroredSpaces(acc: Pick<GoogleAccount, 'mirrorSpaceIds'>, userSpaceIds: readonly string[]): string[] {
  return acc.mirrorSpaceIds.length ? acc.mirrorSpaceIds.filter((s) => userSpaceIds.includes(s)) : [...userSpaceIds];
}

export function safeEntries(item: Item, today: string): CalendarEntry[] {
  try {
    return calendarEntries(item, today);
  } catch (e) {
    console.warn('일정 변환 실패', item.id, e);
    return [];
  }
}

// ── 토큰 ─────────────────────────────────────────────

export class CalendarDisconnected extends Error {}

const accessTokens = new Map<string, { token: string; expiresAt: number }>();

async function accessTokenFor(deps: Deps, acc: GoogleAccount): Promise<string> {
  const hit = accessTokens.get(acc.uid);
  if (hit && hit.expiresAt - 60_000 > deps.now()) return hit.token;
  const refresh = await decryptToken(acc.refreshTokenEnc, deps.cfg.secret('TOKEN_ENC_KEY'));
  try {
    const r = await deps.google.refresh(refresh);
    accessTokens.set(acc.uid, { token: r.accessToken, expiresAt: deps.now() + r.expiresIn * 1000 });
    return r.accessToken;
  } catch (e) {
    if (e instanceof GoogleApiError && e.reason === 'invalid_grant') {
      // 사용자가 구글에서 권한을 철회했다 → 연결을 정리한다
      await deps.index.deleteLinksByUser(acc.uid);
      await deps.index.deleteGoogleAccount(acc.uid);
      accessTokens.delete(acc.uid);
      throw new CalendarDisconnected(acc.uid);
    }
    throw e;
  }
}

/** 시험용: 캐시 비우기 */
export function clearCalendarTokenCache(): void {
  accessTokens.clear();
}

// ── 일정 반영 ────────────────────────────────────────

/** budget: 남은 구글 호출 수. 다 쓰면 멈추고 정기 작업이 이어서 한다 */
export interface Budget {
  left: number;
}

async function applyPlan(
  deps: Deps,
  acc: GoogleAccount,
  token: string,
  itemId: string,
  plan: CalendarPlan,
  itemUpdatedAt: number,
): Promise<void> {
  const cal = acc.calendarId!;
  for (const l of plan.drops) await deps.index.deleteLink(l.uid, l.itemId, l.occurrenceKey);
  for (const e of plan.inserts) {
    const ev = await deps.google.insertEvent(token, cal, entryToEventBody(e, itemId));
    await deps.index.upsertLink({ uid: acc.uid, itemId, occurrenceKey: e.key, googleEventId: ev.id, itemUpdatedAt });
  }
  for (const { entry, link } of plan.updates) {
    const body = entryToEventBody(entry, itemId);
    const ev = (await deps.google.updateEvent(token, cal, link.googleEventId, body)) ?? (await deps.google.insertEvent(token, cal, body));
    await deps.index.upsertLink({ ...link, googleEventId: ev.id, itemUpdatedAt });
  }
  for (const l of plan.deletes) {
    await deps.google.deleteEvent(token, cal, l.googleEventId);
    await deps.index.deleteLink(l.uid, l.itemId, l.occurrenceKey);
  }
}

/** 항목 하나를 연결된 모든 사용자의 캘린더에 반영한다 (항목이 지워졌으면 일정도 지운다) */
export async function propagateItem(deps: Deps, itemId: string, opts: { force?: boolean } = {}): Promise<void> {
  const accounts = (await deps.index.listGoogleAccounts()).filter((a) => a.calendarId);
  if (!accounts.length) return;
  const item = await getItem(deps, itemId);
  const links = await deps.index.listLinksByItem(itemId);
  const users = item ? await deps.docs.getMany<UserDoc>(accounts.map((a) => P.user(a.uid))) : new Map<string, UserDoc>();
  const today = seoulToday(deps.now());
  for (const acc of accounts) {
    const mine = links.filter((l) => l.uid === acc.uid);
    const user = users.get(P.user(acc.uid));
    const visible = !!item && !!user && item.spaceIds.some((s) => mirroredSpaces(acc, user.spaceIds ?? []).includes(s));
    if (!visible && !mine.length) continue;
    const plan = planCalendarSync(visible && item ? safeEntries(item, today) : [], mine, item?.updatedAt ?? 0, opts.force);
    if (!planSize(plan) && !plan.drops.length) continue;
    try {
      await applyPlan(deps, acc, await accessTokenFor(deps, acc), itemId, plan, item?.updatedAt ?? 0);
    } catch (e) {
      if (e instanceof CalendarDisconnected) continue;
      console.error('캘린더 반영 실패', acc.uid, itemId, e);
      await deps.index.patchGoogleAccount(acc.uid, { fullSyncPending: true });
    }
  }
}

/**
 * 한 사용자의 캘린더 전체를 맞춘다. 호출 수가 budget을 넘으면 멈추고 fullSyncPending을 남긴다.
 * @returns 끝까지 했으면 true
 */
export async function fullSync(deps: Deps, uid: string, opts: { force?: boolean; budget?: number } = {}): Promise<boolean> {
  const acc = await deps.index.getGoogleAccount(uid);
  if (!acc?.calendarId) return true;
  const user = await getUser(deps, uid);
  if (!user) return true;
  let token: string;
  try {
    token = await accessTokenFor(deps, acc);
  } catch (e) {
    if (e instanceof CalendarDisconnected) return true;
    throw e;
  }
  const spaces = mirroredSpaces(acc, user.spaceIds);
  const items = spaces.length ? await queryContainsAny<Item>(deps.docs, 'items', 'spaceIds', spaces) : [];
  const links = await deps.index.listLinksByUser(uid);
  const byItem = new Map<string, CalendarLink[]>();
  for (const l of links) byItem.set(l.itemId, [...(byItem.get(l.itemId) ?? []), l]);
  const today = seoulToday(deps.now());
  let left = opts.budget ?? deps.cfg.calendarBudget;

  const work: { itemId: string; plan: CalendarPlan; updatedAt: number }[] = [];
  const seen = new Set<string>();
  for (const d of items) {
    seen.add(d.id);
    const item = { ...d.data, id: d.id };
    work.push({ itemId: d.id, plan: planCalendarSync(safeEntries(item, today), byItem.get(d.id) ?? [], item.updatedAt, opts.force), updatedAt: item.updatedAt });
  }
  for (const [itemId, ls] of byItem) {
    if (!seen.has(itemId)) work.push({ itemId, plan: planCalendarSync([], ls, 0), updatedAt: 0 });
  }

  let complete = true;
  try {
    for (const w of work) {
      const size = planSize(w.plan);
      if (!size && !w.plan.drops.length) continue;
      if (size > left) {
        complete = false;
        break;
      }
      await applyPlan(deps, acc, token, w.itemId, w.plan, w.updatedAt);
      left -= size;
    }
  } catch (e) {
    console.error('전체 동기화 실패', uid, e);
    complete = false;
  }
  await deps.index.patchGoogleAccount(uid, {
    fullSyncPending: !complete,
    ...(complete ? { lastFullSyncAt: deps.now() } : {}),
  });
  return complete;
}

/** 공간 참여·탈퇴 뒤: 바뀐 항목을 반영하고, 해당 사용자 캘린더를 다시 맞춘다 */
export async function afterMembershipChange(deps: Deps, uids: readonly string[], itemIds: readonly string[]): Promise<void> {
  for (const id of uniq(itemIds)) await propagateItem(deps, id);
  for (const uid of uniq(uids)) {
    const acc = await deps.index.getGoogleAccount(uid);
    if (acc) {
      await deps.index.patchGoogleAccount(uid, { fullSyncPending: true });
      await fullSync(deps, uid);
    }
  }
}

// ── 연결·해제·설정 ───────────────────────────────────

async function channelToken(deps: Deps, uid: string): Promise<string> {
  return hmacHex(deps.cfg.secret('GOOGLE_WEBHOOK_SECRET'), `gcal:${uid}`);
}

async function startChannel(
  deps: Deps,
  uid: string,
  token: string,
  calendarId: string,
): Promise<Pick<GoogleAccount, 'channelId' | 'channelResourceId' | 'channelExpiresAt'>> {
  try {
    const id = crypto.randomUUID();
    const r = await deps.google.watch(token, calendarId, {
      id,
      address: `${deps.cfg.apiOrigin}/calendar/google/webhook`,
      token: await channelToken(deps, uid),
      ttlSeconds: CHANNEL_TTL_SECONDS,
    });
    return { channelId: id, channelResourceId: r.resourceId, channelExpiresAt: r.expiration };
  } catch (e) {
    // 알림 채널이 실패해도 연결은 유지한다 (정기 작업이 다시 시도)
    console.error('변경 알림 채널 만들기 실패', uid, e);
    return { channelId: null, channelResourceId: null, channelExpiresAt: null };
  }
}

/** 지금 상태의 syncToken (모든 페이지를 넘겨야 받을 수 있다) */
async function currentSyncToken(deps: Deps, token: string, calendarId: string): Promise<string | null> {
  let pageToken: string | null = null;
  for (let i = 0; i < 50; i++) {
    const page = await deps.google.listEvents(token, calendarId, { pageToken });
    if (page.nextSyncToken) return page.nextSyncToken;
    pageToken = page.nextPageToken;
    if (!pageToken) return null;
  }
  return null;
}

function validateMirror(mirror: readonly string[], user: UserDoc): string[] {
  if (mirror.some((s) => !user.spaceIds.includes(s))) throw badRequest('내가 속한 공간만 고를 수 있어요', 'invalid_space');
  return uniq(mirror);
}

export async function connectGoogle(deps: Deps, uid: string, req: GoogleConnectRequest): Promise<GoogleStatus> {
  const user = await requireUser(deps, uid);
  const mirror = validateMirror(req.mirrorSpaceIds ?? [], user);
  let tokens;
  try {
    tokens = await deps.google.exchangeCode(req.code, req.redirectUri);
  } catch (e) {
    console.warn('구글 코드 교환 실패', e);
    throw badRequest('구글 연결에 실패했어요. 다시 시도해 주세요', 'google_exchange_failed');
  }
  if (tokens.scope && !tokens.scope.split(' ').includes(CALENDAR_SCOPE)) {
    throw badRequest('캘린더 권한을 허용해 주세요', 'google_scope_missing');
  }
  const encKey = deps.cfg.secret('TOKEN_ENC_KEY');
  const existing = await deps.index.getGoogleAccount(uid);
  let refreshToken = tokens.refreshToken;
  if (!refreshToken && existing) refreshToken = await decryptToken(existing.refreshTokenEnc, encKey).catch(() => null);
  if (!refreshToken) {
    throw badRequest('구글 권한을 다시 허용해 주세요 (구글 계정 설정에서 한지붕 접근을 지운 뒤 다시 연결)', 'google_no_refresh_token');
  }
  const access = tokens.accessToken;
  accessTokens.set(uid, { token: access, expiresAt: deps.now() + tokens.expiresIn * 1000 });

  const email = await deps.google.userEmail(access, tokens.idToken);
  let calendarId = existing?.calendarId ?? null;
  if (calendarId && !(await deps.google.calendarExists(access, calendarId))) calendarId = null;
  if (!calendarId) calendarId = await deps.google.createCalendar(access, CALENDAR_NAME, TIME_ZONE);
  if (calendarId !== existing?.calendarId) await deps.index.deleteLinksByUser(uid);

  if (existing?.channelId && existing.channelResourceId) {
    await deps.google.stopChannel(access, { id: existing.channelId, resourceId: existing.channelResourceId }).catch(() => undefined);
  }
  const syncToken = await currentSyncToken(deps, access, calendarId);
  const channel = await startChannel(deps, uid, access, calendarId);
  await deps.index.upsertGoogleAccount({
    uid,
    email,
    refreshTokenEnc: await encryptToken(refreshToken, encKey),
    calendarId,
    mirrorSpaceIds: mirror,
    ...channel,
    syncToken,
    fullSyncPending: true,
    lastFullSyncAt: null,
    updatedAt: deps.now(),
  });
  deps.defer(fullSync(deps, uid));
  return { connected: true, email, mirrorSpaceIds: mirror };
}

export async function googleStatus(deps: Deps, uid: string): Promise<GoogleStatus> {
  const acc = await deps.index.getGoogleAccount(uid);
  return { connected: !!acc, email: acc?.email ?? null, mirrorSpaceIds: acc?.mirrorSpaceIds ?? [] };
}

export async function updateGoogleSettings(deps: Deps, uid: string, mirrorSpaceIds: readonly string[]): Promise<GoogleStatus> {
  const acc = await deps.index.getGoogleAccount(uid);
  if (!acc) throw badRequest('구글 캘린더가 연결돼 있지 않아요', 'google_not_connected');
  const user = await requireUser(deps, uid);
  const mirror = validateMirror(mirrorSpaceIds, user);
  await deps.index.patchGoogleAccount(uid, { mirrorSpaceIds: mirror, fullSyncPending: true, updatedAt: deps.now() });
  deps.defer(fullSync(deps, uid));
  return { connected: true, email: acc.email, mirrorSpaceIds: mirror };
}

export async function disconnectGoogle(deps: Deps, uid: string, deleteCalendar: boolean): Promise<void> {
  const acc = await deps.index.getGoogleAccount(uid);
  if (!acc) return;
  try {
    const token = await accessTokenFor(deps, acc);
    if (acc.channelId && acc.channelResourceId) {
      await deps.google.stopChannel(token, { id: acc.channelId, resourceId: acc.channelResourceId }).catch(() => undefined);
    }
    if (deleteCalendar && acc.calendarId) await deps.google.deleteCalendar(token, acc.calendarId);
    const refresh = await decryptToken(acc.refreshTokenEnc, deps.cfg.secret('TOKEN_ENC_KEY'));
    await deps.google.revoke(refresh);
  } catch (e) {
    if (!(e instanceof CalendarDisconnected)) console.error('구글 연결 해제 중 오류 (서버 데이터는 지운다)', uid, e);
  }
  accessTokens.delete(uid);
  await deps.index.deleteLinksByUser(uid);
  await deps.index.deleteGoogleAccount(uid);
}

// ── 변경 알림 (구글 → 앱) ─────────────────────────────

export type WebhookResult = 'ok' | 'ignored' | 'forbidden';

export async function handleWebhook(deps: Deps, headers: { channelId?: string; token?: string; state?: string }): Promise<WebhookResult> {
  if (!headers.channelId) return 'ignored';
  const acc = await deps.index.getGoogleAccountByChannel(headers.channelId);
  if (!acc) return 'ignored'; // 예전 채널
  if (!headers.token || !(await hmacVerifyHex(deps.cfg.secret('GOOGLE_WEBHOOK_SECRET'), `gcal:${acc.uid}`, headers.token))) {
    return 'forbidden';
  }
  if (headers.state === 'sync') return 'ok'; // 채널을 만든 직후의 첫 알림
  deps.defer(incrementalSync(deps, acc.uid));
  return 'ok';
}

export async function incrementalSync(deps: Deps, uid: string): Promise<void> {
  const acc = await deps.index.getGoogleAccount(uid);
  if (!acc?.calendarId) return;
  let token: string;
  try {
    token = await accessTokenFor(deps, acc);
  } catch (e) {
    if (e instanceof CalendarDisconnected) return;
    throw e;
  }
  const resync = async () => {
    const fresh = await currentSyncToken(deps, token, acc.calendarId!);
    await deps.index.patchGoogleAccount(uid, { syncToken: fresh, fullSyncPending: true });
    await fullSync(deps, uid, { force: true });
  };
  if (!acc.syncToken) return resync();

  const changed: GEvent[] = [];
  let pageToken: string | null = null;
  let nextSync: string | null = null;
  try {
    do {
      const page = await deps.google.listEvents(token, acc.calendarId, { syncToken: acc.syncToken, pageToken });
      changed.push(...page.items);
      pageToken = page.nextPageToken;
      nextSync = page.nextSyncToken ?? nextSync;
    } while (pageToken);
  } catch (e) {
    if (e instanceof GoogleApiError && e.status === 410) return resync(); // syncToken 만료 → 전체 다시
    throw e;
  }
  await applyGoogleChanges(deps, acc, token, changed);
  if (nextSync) await deps.index.patchGoogleAccount(uid, { syncToken: nextSync });
}

export async function applyGoogleChanges(deps: Deps, acc: GoogleAccount, token: string, events: readonly GEvent[]): Promise<string[]> {
  if (!events.length) return [];
  const links = new Map((await deps.index.listLinksByUser(acc.uid)).map((l) => [l.googleEventId, l]));
  const relevant = events.filter((ev) => links.has(ev.id));
  if (!relevant.length) return [];
  const items = await deps.docs.getMany<Item>(uniq(relevant.map((ev) => P.item(links.get(ev.id)!.itemId))));
  const user = await getUser(deps, acc.uid);
  const today = seoulToday(deps.now());
  const cal = acc.calendarId!;
  const edited: Item[] = [];

  for (const ev of relevant) {
    const link = links.get(ev.id)!;
    if (ev.status === 'cancelled') {
      // 구글에서 지웠다 → 그 사람 캘린더에서만 빠진다 (항목은 그대로, 다시 넣지 않는다)
      await deps.index.upsertLink({ ...link, googleEventId: DELETED_EVENT });
      continue;
    }
    const raw = items.get(P.item(link.itemId));
    const item = raw ? { ...raw, id: link.itemId } : null;
    const entry = item ? safeEntries(item, today).find((e) => e.key === link.occurrenceKey) : undefined;
    if (!item || !entry) {
      await deps.google.deleteEvent(token, cal, ev.id);
      await deps.index.deleteLink(link.uid, link.itemId, link.occurrenceKey);
      continue;
    }
    if (eventMatchesEntry(ev, entry)) continue; // 앱이 보낸 그대로
    if (user && canMapBack(item, entry) && canEditItem(item, acc.uid, user.spaceIds)) {
      const patch = itemPatchFromEvent(ev, item);
      if (patch) {
        const now = deps.now();
        await deps.docs.commit([{ op: 'update', path: P.item(item.id), data: { ...patch, updatedAt: now, updatedBy: acc.uid } }]);
        await deps.index.upsertLink({ ...link, itemUpdatedAt: now });
        edited.push({ ...item, ...patch, updatedAt: now });
        continue;
      }
    }
    // 수정 권한이 없거나 반복·펼친 일정이면 앱 내용으로 되돌린다
    const body = entryToEventBody(entry, item.id);
    const fixed = (await deps.google.updateEvent(token, cal, ev.id, body)) ?? (await deps.google.insertEvent(token, cal, body));
    await deps.index.upsertLink({ ...link, googleEventId: fixed.id });
  }

  for (const item of edited) {
    await propagateItem(deps, item.id);
    await notifyViewers(deps, item);
  }
  return edited.map((i) => i.id);
}

/** 항목을 볼 수 있는 사람 (공유 범위 공간의 계정 구성원) */
export async function itemViewers(deps: Deps, item: Pick<Item, 'spaceIds'>): Promise<string[]> {
  const spaces = await deps.docs.getMany<{ memberUids?: string[] }>(item.spaceIds.map(P.space));
  return uniq([...spaces.values()].flatMap((s) => s.memberUids ?? []));
}

/** 위젯 갱신용 무음 푸시 */
export async function notifyViewers(deps: Deps, item: Pick<Item, 'id' | 'spaceIds'>): Promise<void> {
  await pushToUsers(deps, await itemViewers(deps, item), silent({ type: 'items-changed', itemId: item.id }));
}

// ── 정기 작업 ────────────────────────────────────────

/** 만료 24시간 안의 알림 채널을 새로 만든다 */
export async function renewChannels(deps: Deps): Promise<number> {
  const now = deps.now();
  let renewed = 0;
  for (const acc of await deps.index.listGoogleAccounts()) {
    if (!acc.calendarId) continue;
    if (acc.channelExpiresAt && acc.channelExpiresAt > now + DAY) continue;
    try {
      const token = await accessTokenFor(deps, acc);
      const channel = await startChannel(deps, acc.uid, token, acc.calendarId);
      if (!channel.channelId) continue;
      if (acc.channelId && acc.channelResourceId) {
        await deps.google.stopChannel(token, { id: acc.channelId, resourceId: acc.channelResourceId }).catch(() => undefined);
      }
      await deps.index.patchGoogleAccount(acc.uid, { ...channel, updatedAt: now });
      renewed++;
    } catch (e) {
      if (!(e instanceof CalendarDisconnected)) console.error('채널 갱신 실패', acc.uid, e);
    }
  }
  return renewed;
}
