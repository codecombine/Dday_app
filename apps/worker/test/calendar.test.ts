import type { CalendarEntry, Item } from '@hanjibung/core';
import { beforeEach, describe, expect, it } from 'vitest';

import type { GEvent } from '../src/google/calendar';
import { P } from '../src/repo/docstore';
import type { CalendarLink } from '../src/repo/index-store';
import {
  clearCalendarTokenCache,
  connectGoogle,
  DELETED_EVENT,
  disconnectGoogle,
  entryToEventBody,
  eventMatchesEntry,
  eventSchedule,
  googleStatus,
  handleWebhook,
  incrementalSync,
  itemPatchFromEvent,
  planCalendarSync,
  propagateItem,
  updateGoogleSettings,
} from '../src/services/calendar-sync';
import { hmacHex } from '../src/util/crypto';
import { type Harness, makeHarness, seedItem, seedSpace, seedUser, TEST_ENV } from './fakes/harness';

const entry = (key: string, over: Partial<CalendarEntry> = {}): CalendarEntry => ({
  key,
  title: '저녁',
  description: '',
  allDay: false,
  startDate: '2026-10-18',
  startTime: '17:00',
  endDate: '2026-10-18',
  endTime: '19:00',
  rrule: null,
  ...over,
});
const link = (key: string, updatedAt: number, gid = `g-${key}`): CalendarLink => ({
  uid: 'u',
  itemId: 'i',
  occurrenceKey: key,
  googleEventId: gid,
  itemUpdatedAt: updatedAt,
});

describe('캘린더 반영 계획 (planCalendarSync)', () => {
  it('새 키는 넣고, 바뀐 항목은 고치고, 없어진 키는 지운다', () => {
    const plan = planCalendarSync([entry('Y:2026'), entry('Y:2027'), entry('Y:2028')], [link('Y:2025', 1), link('Y:2026', 1), link('Y:2027', 2)], 2);
    expect(plan.inserts.map((e) => e.key)).toEqual(['Y:2028']);
    expect(plan.updates.map((u) => u.entry.key)).toEqual(['Y:2026']);
    expect(plan.deletes.map((l) => l.occurrenceKey)).toEqual(['Y:2025']);
    expect(plan.drops).toEqual([]);
  });

  it('그대로면 아무것도 하지 않고, force면 모두 고친다', () => {
    expect(planCalendarSync([entry('base')], [link('base', 5)], 5)).toEqual({ inserts: [], updates: [], deletes: [], drops: [] });
    expect(planCalendarSync([entry('base')], [link('base', 5)], 5, true).updates).toHaveLength(1);
  });

  it('볼 수 없게 되면 전부 지운다', () => {
    expect(planCalendarSync([], [link('base', 1), link('M:100일', 1)], 1).deletes).toHaveLength(2);
  });

  it('구글에서 지운 일정(표시)은 다시 넣지 않고, 더 필요 없으면 매핑만 지운다', () => {
    const tomb = link('base', 1, DELETED_EVENT);
    expect(planCalendarSync([entry('base')], [tomb], 2)).toEqual({ inserts: [], updates: [], deletes: [], drops: [] });
    expect(planCalendarSync([], [tomb], 2).drops).toEqual([tomb]);
  });

  it('같은 키가 두 번 오면 한 번만', () => {
    expect(planCalendarSync([entry('base'), entry('base')], [], 1).inserts).toHaveLength(1);
  });
});

describe('일정 변환', () => {
  it('종일 일정: 끝 날짜는 다음 날(배타), 반복 규칙', () => {
    const body = entryToEventBody(entry('base', { allDay: true, startTime: null, endTime: null, endDate: '2026-10-19', rrule: 'FREQ=YEARLY' }), 'item1');
    expect(body.start).toEqual({ date: '2026-10-18' });
    expect(body.end).toEqual({ date: '2026-10-20' });
    expect(body.recurrence).toEqual(['RRULE:FREQ=YEARLY']);
    expect(body.extendedProperties.private).toEqual({ hjItemId: 'item1', hjKey: 'base' });
    expect(body.reminders).toEqual({ useDefault: false });
  });

  it('시각 일정: 서울 시간대, 끝이 시작보다 빠르면 시작으로', () => {
    const body = entryToEventBody(entry('base', { endTime: '16:00' }), 'i');
    expect(body.start).toEqual({ dateTime: '2026-10-18T17:00:00', timeZone: 'Asia/Seoul' });
    expect(body.end).toEqual({ dateTime: '2026-10-18T17:00:00', timeZone: 'Asia/Seoul' });
  });

  it('구글이 돌려준 일정(UTC·오프셋)을 서울 시간으로 읽고, 보낸 그대로면 같다고 본다', () => {
    const e = entry('base');
    const fromGoogle: GEvent = {
      id: 'x',
      summary: '저녁',
      start: { dateTime: '2026-10-18T08:00:00Z' },
      end: { dateTime: '2026-10-18T19:00:00+09:00' },
    };
    expect(eventSchedule(fromGoogle)).toEqual({ allDay: false, startDate: '2026-10-18', startTime: '17:00', endDate: '2026-10-18', endTime: '19:00' });
    expect(eventMatchesEntry(fromGoogle, e)).toBe(true);
    expect(eventMatchesEntry({ ...fromGoogle, summary: '점심' }, e)).toBe(false);
    const allDay = entry('base', { allDay: true, startTime: null, endTime: null });
    expect(eventMatchesEntry({ id: 'y', summary: '저녁', start: { date: '2026-10-18' }, end: { date: '2026-10-19' } }, allDay)).toBe(true);
  });

  it('구글에서 고친 내용 → 항목 수정 내용', () => {
    const item = { title: '저녁', kind: 'event' as const };
    expect(
      itemPatchFromEvent({ id: 'x', summary: ' 외식 ', start: { dateTime: '2026-10-19T09:30:00Z' }, end: { dateTime: '2026-10-19T11:00:00Z' } }, item),
    ).toEqual({ title: '외식', allDay: false, date: '2026-10-19', time: '18:30', endDate: null, endTime: '20:00' });
    expect(itemPatchFromEvent({ id: 'x', summary: '', start: { date: '2026-10-20' }, end: { date: '2026-10-23' } }, item)).toEqual({
      title: '저녁',
      allDay: true,
      date: '2026-10-20',
      time: null,
      endDate: '2026-10-22',
      endTime: null,
    });
    expect(itemPatchFromEvent({ id: 'x', summary: '생일', start: { date: '2026-11-01' } }, { title: 'a', kind: 'anniversary' })).toEqual({
      title: '생일',
      date: '2026-11-01',
    });
  });
});

describe('구글 캘린더 동기화 (가짜 구글)', () => {
  let h: Harness;
  const items: Record<string, Item> = {};

  beforeEach(() => {
    h = makeHarness();
    seedUser(h, 'mom', ['home']);
    seedUser(h, 'dad', ['home']);
    seedSpace(h, 'home', ['mom'], ['mom', 'dad']);
    items.dinner = seedItem(h, { id: 'dinner', ownerUid: 'mom', spaceIds: ['home'], title: '외가 저녁' });
    items.secret = seedItem(h, { id: 'secret', ownerUid: 'dad', spaceIds: ['personal_dad'], title: '깜짝 선물' });
    items.birthday = seedItem(h, {
      id: 'birthday',
      ownerUid: 'dad',
      spaceIds: ['home'],
      kind: 'anniversary',
      title: '아빠 생일',
      date: '1980-03-14',
      allDay: true,
      time: null,
      repeat: 'yearly',
    });
    items.baby = seedItem(h, {
      id: 'baby',
      ownerUid: 'mom',
      spaceIds: ['personal_mom'],
      kind: 'anniversary',
      title: '우리 아기',
      date: '2026-05-01',
      allDay: true,
      time: null,
      mode: 'since',
      milestones: true,
    });
  });

  async function connect(uid: string, mirror?: string[]) {
    const status = await connectGoogle(h.deps, uid, { code: 'ok', redirectUri: 'postmessage', mirrorSpaceIds: mirror });
    await h.flush();
    const acc = (await h.index.getGoogleAccount(uid))!;
    return { status, acc, events: () => h.google.events(acc.calendarId!) };
  }

  async function webhook(uid: string, channelId: string) {
    const token = await hmacHex(TEST_ENV.GOOGLE_WEBHOOK_SECRET!, `gcal:${uid}`);
    const r = await handleWebhook(h.deps, { channelId, token, state: 'exists' });
    await h.flush();
    return r;
  }

  it('연결: 캘린더를 만들고 볼 수 있는 항목만 넣는다 (기념일 1년치 포함)', async () => {
    const { status, acc, events } = await connect('mom');
    expect(status).toEqual({ connected: true, email: 'family@example.com', mirrorSpaceIds: [] });
    expect(acc.refreshTokenEnc).not.toContain('refresh-1');
    expect(acc.channelId).toBeTruthy();
    expect(acc.fullSyncPending).toBe(false);
    const titles = events().map((e) => e.summary).sort();
    expect(titles).toContain('외가 저녁');
    expect(titles).toContain('아빠 생일');
    expect(titles).toContain('우리 아기');
    expect(titles).toContain('우리 아기 200일');
    expect(titles).not.toContain('깜짝 선물');
    const birthday = events().find((e) => e.summary === '아빠 생일')!;
    expect(birthday.recurrence).toEqual(['RRULE:FREQ=YEARLY']);
    expect(await googleStatus(h.deps, 'mom')).toMatchObject({ connected: true });
  });

  it('반영할 공간을 고르면 나머지는 빠진다', async () => {
    const { events } = await connect('mom');
    await updateGoogleSettings(h.deps, 'mom', ['personal_mom']);
    await h.flush();
    const titles = events().map((e) => e.summary);
    expect(titles).not.toContain('외가 저녁');
    expect(titles).toContain('우리 아기');
    await expect(updateGoogleSettings(h.deps, 'mom', ['not-mine'])).rejects.toMatchObject({ code: 'invalid_space' });
  });

  it('앱에서 고치면 연결된 가족 모두에게 반영, 볼 수 없게 되면 지운다', async () => {
    const mom = await connect('mom');
    const dad = await connect('dad');
    expect(dad.events().map((e) => e.summary)).toContain('외가 저녁');
    h.docs.seed(P.item('dinner'), { ...items.dinner, title: '외가 점심', time: '12:00', updatedAt: items.dinner!.updatedAt + 1 });
    await propagateItem(h.deps, 'dinner');
    expect(mom.events().find((e) => e.extendedProperties?.private?.hjItemId === 'dinner')?.summary).toBe('외가 점심');
    expect(dad.events().find((e) => e.extendedProperties?.private?.hjItemId === 'dinner')?.start).toEqual({
      dateTime: '2026-10-18T12:00:00',
      timeZone: 'Asia/Seoul',
    });
    // 나만 보기로 바꾸면 아빠 캘린더에서 빠진다
    h.docs.seed(P.item('dinner'), { ...items.dinner, spaceIds: ['personal_mom'], updatedAt: items.dinner!.updatedAt + 2 });
    await propagateItem(h.deps, 'dinner');
    expect(dad.events().some((e) => e.extendedProperties?.private?.hjItemId === 'dinner')).toBe(false);
    expect(mom.events().some((e) => e.extendedProperties?.private?.hjItemId === 'dinner')).toBe(true);
    // 항목이 지워지면 모두 지운다
    await h.docs.commit([{ op: 'delete', path: P.item('dinner') }]);
    await propagateItem(h.deps, 'dinner');
    expect(mom.events().some((e) => e.extendedProperties?.private?.hjItemId === 'dinner')).toBe(false);
    expect(await h.index.listLinksByItem('dinner')).toEqual([]);
  });

  it('구글에서 고치면: 수정 권한이 있으면 항목에 반영, 없으면 되돌린다', async () => {
    const mom = await connect('mom');
    const dad = await connect('dad');
    // 연결 직후 우리가 넣은 일정의 변경 알림은 메아리라서 무시된다
    await webhook('mom', mom.acc.channelId!);
    expect(h.docs.data<Item>(P.item('dinner'))!.title).toBe('외가 저녁');

    const dinnerEv = mom.events().find((e) => e.summary === '외가 저녁')!;
    h.google.userEdit(mom.acc.calendarId!, dinnerEv.id, {
      summary: '외가 저녁 (장소 변경)',
      start: { dateTime: '2026-10-18T18:00:00+09:00' },
      end: { dateTime: '2026-10-18T20:00:00+09:00' },
    });
    const birthdayEv = mom.events().find((e) => e.summary === '아빠 생일')!;
    h.google.userEdit(mom.acc.calendarId!, birthdayEv.id, { summary: '아빠 생신' });
    h.tick(1000);
    expect(await webhook('mom', mom.acc.channelId!)).toBe('ok');

    const dinner = h.docs.data<Item>(P.item('dinner'))!;
    expect(dinner).toMatchObject({ title: '외가 저녁 (장소 변경)', time: '18:00', endTime: '20:00', updatedBy: 'mom' });
    expect(dinner.updatedAt).toBe(h.deps.now());
    // 아빠 캘린더에도 반영
    expect(dad.events().find((e) => e.extendedProperties?.private?.hjItemId === 'dinner')?.summary).toBe('외가 저녁 (장소 변경)');
    // 아빠 생일은 엄마가 고칠 수 없다(반복 일정이기도 하다) → 되돌림
    expect(mom.events().find((e) => e.id === birthdayEv.id)?.summary).toBe('아빠 생일');
    expect(h.docs.data<Item>(P.item('birthday'))!.title).toBe('아빠 생일');
  });

  it('구글에서 지우면 그 사람 캘린더에서만 빠지고 다시 넣지 않는다', async () => {
    const mom = await connect('mom');
    const ev = mom.events().find((e) => e.summary === '외가 저녁')!;
    await h.google.deleteEvent('t', mom.acc.calendarId!, ev.id);
    await webhook('mom', mom.acc.channelId!);
    expect(h.docs.data<Item>(P.item('dinner'))).toBeDefined();
    const [l] = (await h.index.listLinksByItem('dinner')).filter((x) => x.uid === 'mom');
    expect(l?.googleEventId).toBe(DELETED_EVENT);
    h.docs.seed(P.item('dinner'), { ...items.dinner, title: '바뀜', updatedAt: items.dinner!.updatedAt + 5 });
    await propagateItem(h.deps, 'dinner');
    expect(mom.events().some((e) => e.extendedProperties?.private?.hjItemId === 'dinner')).toBe(false);
  });

  it('변경 알림 채널 토큰이 틀리면 거부, 모르는 채널은 무시', async () => {
    const mom = await connect('mom');
    expect(await handleWebhook(h.deps, { channelId: mom.acc.channelId!, token: 'f'.repeat(64), state: 'exists' })).toBe('forbidden');
    expect(await handleWebhook(h.deps, { channelId: 'unknown', token: 'x', state: 'exists' })).toBe('ignored');
    const token = await hmacHex(TEST_ENV.GOOGLE_WEBHOOK_SECRET!, 'gcal:mom');
    expect(await handleWebhook(h.deps, { channelId: mom.acc.channelId!, token, state: 'sync' })).toBe('ok');
  });

  it('syncToken이 만료(410)되면 전체를 다시 맞춘다', async () => {
    const mom = await connect('mom');
    const ev = mom.events().find((e) => e.summary === '외가 저녁')!;
    // 사용자가 고쳤지만 알림을 놓쳤고 토큰도 만료됨 → 앱 내용으로 덮어쓴다
    h.google.userEdit(mom.acc.calendarId!, ev.id, { description: '메모' });
    h.google.expiredSyncTokens.add(mom.acc.syncToken!);
    await incrementalSync(h.deps, 'mom');
    const acc = (await h.index.getGoogleAccount('mom'))!;
    expect(acc.syncToken).not.toBe(mom.acc.syncToken);
    expect(mom.events().find((e) => e.id === ev.id)?.description).toBe('');
  });

  it('해제: 채널 중지, 캘린더 삭제(선택), 권한 철회, 서버 데이터 삭제', async () => {
    const mom = await connect('mom');
    await disconnectGoogle(h.deps, 'mom', true);
    expect(h.google.calendars.has(mom.acc.calendarId!)).toBe(false);
    expect(h.google.revoked).toEqual(['refresh-1']);
    expect(h.google.stopped).toContain(mom.acc.channelId);
    expect(await h.index.getGoogleAccount('mom')).toBeNull();
    expect(await h.index.listLinksByUser('mom')).toEqual([]);
  });

  it('구글에서 권한을 철회했으면 연결을 정리한다', async () => {
    await connect('mom');
    clearCalendarTokenCache();
    h.google.refreshFails = true;
    h.docs.seed(P.item('dinner'), { ...items.dinner, title: '바뀜', updatedAt: items.dinner!.updatedAt + 1 });
    await propagateItem(h.deps, 'dinner');
    expect(await h.index.getGoogleAccount('mom')).toBeNull();
  });
});
