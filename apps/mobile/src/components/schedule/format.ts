// 일정·기념일 화면에서 쓰는 표시용 문자열 도우미. 날짜 계산은 모두 @hanjibung/core에 맡긴다.
import {
  addDays,
  diffDays,
  formatDday,
  formatKoreanDate,
  formatLunar,
  lunarToSolar,
  parseISODate,
  WEEKDAY_KO,
  dayOfWeek,
  type HHmm,
  type ISODate,
  type Item,
  type ItemStatus,
  type LunarDate,
  type Reminder,
  type Repeat,
} from '@hanjibung/core';

import { participantText } from '@/lib/spaces';

export const REPEAT_LABEL: Record<Repeat, string> = { none: '안 함', weekly: '매주', monthly: '매월', yearly: '매년' };

/** "10월 10일 토요일" */
export function longDayTitle(date: ISODate): string {
  const { m, d } = parseISODate(date);
  return `${m}월 ${d}일 ${WEEKDAY_KO[dayOfWeek(date)]}요일`;
}

/** "오전 9시", "오후 8시 30분" */
export function time12(t: HHmm): string {
  const [hh, mm] = t.split(':').map(Number) as [number, number];
  const am = hh < 12;
  const h = hh % 12 === 0 ? 12 : hh % 12;
  return `${am ? '오전' : '오후'} ${h}시${mm ? ` ${mm}분` : ''}`;
}

/** "음력 9월 15일" (윤달이면 "음력 윤9월 15일") */
export function lunarLong(l: LunarDate): string {
  return `음력 ${l.leap ? '윤' : ''}${l.month}월 ${l.day}일`;
}

export function isSince(item: Pick<Item, 'kind' | 'mode' | 'repeat'>): boolean {
  return item.kind === 'anniversary' && item.mode === 'since' && item.repeat === 'none';
}

/** 여러 날 일정의 일수 (하루짜리는 0) */
export function spanDays(item: Pick<Item, 'date' | 'endDate'>): number {
  return item.endDate ? Math.max(0, diffDays(item.date, item.endDate)) : 0;
}

/** "1박 2일" */
export function spanLabel(item: Pick<Item, 'date' | 'endDate'>): string | null {
  const n = spanDays(item);
  return n > 0 ? `${n}박 ${n + 1}일` : null;
}

/** 누구 일정: 개인 공간에만 있는 "가족 모두"는 굳이 보여주지 않는다 */
export function whoText(item: Pick<Item, 'participants' | 'spaceIds'>, personalSpaceId: string): string {
  if (item.participants.length === 0 && item.spaceIds.length === 1 && item.spaceIds[0] === personalSpaceId) return '';
  return participantText(item);
}

/** 일정 한 줄 설명: "오늘 14:00 · 아빠, 지우", "1박 2일 · 가족 모두", "종일" */
export function eventLine(item: Item, occDate: ISODate, today: ISODate, personalSpaceId: string): string {
  const span = spanLabel(item);
  const timed = !item.allDay && item.time;
  let when = span ?? (timed ? item.time! : '종일');
  if (!span && timed && occDate === today) when = `오늘 ${when}`;
  return [when, whoText(item, personalSpaceId)].filter(Boolean).join(' · ');
}

/** 날짜 범위: "10월 31일 (토) ~ 11월 1일 (일)" */
export function dateRangeText(item: Pick<Item, 'date' | 'endDate'>, start: ISODate = item.date, withYear = false): string {
  const n = spanDays(item);
  const a = formatKoreanDate(start, { year: withYear });
  if (n === 0) return a;
  // 시작일을 다음 회차로 옮겼으면 끝 날짜도 같은 만큼 옮긴다
  return `${a} ~ ${formatKoreanDate(addDays(start, n))}`;
}

/** 시각 표시: "14:00 ~ 16:00", "종일" */
export function timeRangeText(item: Item): string {
  if (item.allDay || !item.time) return '종일';
  return item.endTime && item.endTime !== item.time ? `${item.time} ~ ${item.endTime}` : item.time;
}

/** 다음 날짜 앞에 "올해"/"YYYY년"을 붙인다 */
function yearPrefixed(date: ISODate, today: ISODate): string {
  const y = parseISODate(date).y;
  return `${y === parseISODate(today).y ? '올해 ' : `${y}년 `}${formatKoreanDate(date)}`;
}

/** 기념일 목록 아래 줄 */
export function anniversarySub(item: Item, status: ItemStatus, today: ISODate): string {
  if (isSince(item)) {
    const m = status.nextMilestone;
    if (diffDays(today, item.date) > 0) return `${formatKoreanDate(item.date, { year: true })}부터 세기`;
    if (m) return `${m.label} · ${formatKoreanDate(m.date)} ${formatDday(m.daysUntil)}`;
    return `${formatKoreanDate(item.date, { year: true })}부터`;
  }
  const next = status.nextDate ?? item.date;
  const parts: string[] = [];
  if (item.lunar && item.repeat === 'yearly') {
    parts.push(formatLunar(item.lunar), yearPrefixed(next, today));
  } else {
    parts.push(item.repeat === 'none' ? dateRangeText(item, next) : formatKoreanDate(next));
  }
  if (item.repeat !== 'none') parts.push(REPEAT_LABEL[item.repeat]);
  return parts.join(' · ');
}

/** 알림 한 개: "당일", "1일 전", "2시간 전" */
export function reminderLabel(r: Reminder): string {
  if (r.hoursBefore != null) return `${r.hoursBefore}시간 전`;
  return r.daysBefore === 0 ? '당일' : `${r.daysBefore}일 전`;
}

/** 알림 요약: "7일 전, 당일 오전 9시" (시각이 같으면 끝에 한 번만) */
export function remindersText(reminders: Reminder[]): string {
  if (reminders.length === 0) return '없음';
  const dayBased = reminders.filter((r) => r.hoursBefore == null);
  const hourBased = reminders.filter((r) => r.hoursBefore != null);
  const parts: string[] = [];
  const times = [...new Set(dayBased.map((r) => r.time))];
  if (times.length === 1) {
    parts.push(`${dayBased.map(reminderLabel).join(', ')} ${time12(times[0]!)}`);
  } else {
    parts.push(...dayBased.map((r) => `${reminderLabel(r)} ${time12(r.time)}`));
  }
  parts.push(...hourBased.map(reminderLabel));
  return parts.filter(Boolean).join(', ');
}

/** 올해의 음력 날짜 (양력) — 범위 밖이면 null */
export function lunarThisYear(lunar: LunarDate, today: ISODate): ISODate | null {
  return lunarToSolar(parseISODate(today).y, lunar);
}

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "930" → "09:30", "1400" → "14:00", "9" → "09:00" */
export function normalizeTime(raw: string): string {
  const s = raw.trim();
  if (TIME_RE.test(s)) return s;
  const m = /^(\d{1,2})(?::?(\d{2}))?$/.exec(s);
  if (!m) return s;
  const h = Number(m[1]);
  const mm = m[2] ? Number(m[2]) : 0;
  if (h > 23 || mm > 59) return s;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
