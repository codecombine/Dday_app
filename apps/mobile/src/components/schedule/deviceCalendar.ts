// 폰 캘린더 읽기 (앱, expo-calendar). 웹 구현은 deviceCalendar.web.ts
import { addDays, toISODate, type ISODate, type Repeat } from '@hanjibung/core';
import { getCalendars, listEvents, requestCalendarPermissions, type ExpoCalendarEvent } from 'expo-calendar';

export const DEVICE_CALENDAR_SUPPORTED = true;

export interface DeviceCalendar {
  id: string;
  title: string;
  color: string | null;
  account: string | null;
}

export interface DeviceEvent {
  key: string;
  calendarId: string;
  title: string;
  notes: string;
  allDay: boolean;
  date: ISODate;
  time: string | null;
  endDate: ISODate | null;
  endTime: string | null;
  repeat: Repeat;
}

export async function requestAccess(): Promise<boolean> {
  const res = await requestCalendarPermissions();
  return res.granted;
}

export async function loadCalendars(): Promise<DeviceCalendar[]> {
  const list = await getCalendars();
  return list
    .filter((c) => c.isVisible !== false)
    .map((c) => ({ id: c.id, title: c.title || c.name || '캘린더', color: c.color ?? null, account: c.source?.name ?? c.ownerAccount ?? null }));
}

const pad = (n: number) => String(n).padStart(2, '0');
const asDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));

/** 종일 일정은 UTC 자정 기준으로 저장돼 있어 UTC 날짜를 쓴다 */
function dayOf(d: Date, utc: boolean): ISODate {
  return utc
    ? toISODate({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() })
    : toISODate({ y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() });
}

function repeatOf(e: ExpoCalendarEvent): Repeat {
  const f = e.recurrenceRule?.frequency;
  if (!f || (e.recurrenceRule?.interval ?? 1) !== 1) return 'none';
  return f === 'weekly' || f === 'monthly' || f === 'yearly' ? f : 'none';
}

function toDeviceEvent(e: ExpoCalendarEvent): DeviceEvent {
  const start = asDate(e.startDate);
  const end = asDate(e.endDate);
  const allDay = !!e.allDay;
  const date = dayOf(start, allDay);
  // 종일 일정의 끝은 다음 날 0시(포함 안 함)
  let endDate: ISODate | null = allDay ? addDays(dayOf(end, true), -1) : dayOf(end, false);
  if (endDate <= date) endDate = null;
  return {
    key: `${e.id}`,
    calendarId: e.calendarId,
    title: (e.title || '제목 없음').slice(0, 60),
    notes: e.notes ?? '',
    allDay,
    date,
    time: allDay ? null : `${pad(start.getHours())}:${pad(start.getMinutes())}`,
    endDate,
    endTime: allDay ? null : `${pad(end.getHours())}:${pad(end.getMinutes())}`,
    repeat: repeatOf(e),
  };
}

/** 고른 캘린더의 [from, to] 일정. 반복 일정은 첫 회차 하나만 남긴다 */
export async function loadEvents(calendarIds: string[], from: Date, to: Date): Promise<DeviceEvent[]> {
  if (calendarIds.length === 0) return [];
  const events = await listEvents(calendarIds, from, to);
  const byKey = new Map<string, DeviceEvent>();
  for (const e of events) {
    const ev = toDeviceEvent(e);
    const prev = byKey.get(ev.key);
    if (!prev || ev.date < prev.date) byKey.set(ev.key, ev);
  }
  return [...byKey.values()].sort((a, b) => (a.date === b.date ? (a.time ?? '').localeCompare(b.time ?? '') : a.date < b.date ? -1 : 1));
}
