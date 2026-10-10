// 항목 → 캘린더 일정 변환 (구글 캘린더 동기화와 .ics 내보내기가 함께 쓴다, 명세서 10·11장)
import { nextOccurrence, upcomingMilestones } from './anniversary';
import { addDays, addMonths, diffDays, parseISODate, toISODate } from './dates';
import { formatLunar, lunarToSolar } from './lunar';
import type { HHmm, ISODate, Item } from './types';

export interface CalendarEntry {
  /** 항목 안에서 일정을 구분하는 키. 단일 일정은 'base' */
  key: string;
  title: string;
  description: string;
  allDay: boolean;
  startDate: ISODate;
  startTime: HHmm | null;
  /** 종일 일정은 마지막 날(포함), 시각 일정은 종료 날짜 */
  endDate: ISODate;
  endTime: HHmm | null;
  /** RFC 5545 RRULE (FREQ=YEARLY 등). 없으면 단일 */
  rrule: string | null;
}

const LUNAR_YEARS_AHEAD = 10;
const EXPAND_MONTHS = 24;
const MILESTONE_WINDOW_DAYS = 365;

type EntryItem = Pick<
  Item,
  'title' | 'memo' | 'date' | 'allDay' | 'time' | 'endDate' | 'endTime' | 'repeat' | 'lunar' | 'kind' | 'mode' | 'countFromOne' | 'milestones'
>;

function base(item: EntryItem, key: string, startDate: ISODate, extra: Partial<CalendarEntry> = {}): CalendarEntry {
  const spanDays = item.endDate ? Math.max(0, diffDays(item.date, item.endDate)) : 0;
  return {
    key,
    title: item.title,
    description: item.memo,
    allDay: item.allDay || !item.time,
    startDate,
    startTime: item.allDay ? null : item.time,
    endDate: addDays(startDate, spanDays),
    endTime: item.allDay ? null : (item.endTime ?? item.time),
    rrule: null,
    ...extra,
  };
}

export function calendarEntries(item: EntryItem, today: ISODate): CalendarEntry[] {
  const out: CalendarEntry[] = [];

  if (item.kind === 'anniversary' && item.mode === 'since' && item.repeat === 'none') {
    out.push(base(item, 'base', item.date, { allDay: true, startTime: null, endTime: null }));
    if (item.milestones) {
      const ms = upcomingMilestones(item.date, today, item.countFromOne, 20).filter(
        (m) => m.daysUntil <= MILESTONE_WINDOW_DAYS,
      );
      for (const m of ms) {
        out.push({
          ...base(item, `M:${m.label}`, m.date, { allDay: true, startTime: null, endTime: null }),
          title: `${item.title} ${m.label}`,
        });
      }
    }
    return out;
  }

  if (item.repeat === 'yearly' && item.lunar) {
    const startYear = parseISODate(today).y;
    for (let y = startYear; y < startYear + LUNAR_YEARS_AHEAD; y++) {
      const d = lunarToSolar(y, item.lunar);
      if (!d || diffDays(item.date, d) < 0) continue;
      out.push({
        ...base(item, `Y:${y}`, d),
        description: [formatLunar(item.lunar), item.memo].filter(Boolean).join('\n'),
      });
    }
    return out;
  }

  const { d } = parseISODate(item.date);
  if (item.repeat === 'weekly') return [base(item, 'base', item.date, { rrule: 'FREQ=WEEKLY' })];
  if (item.repeat === 'monthly') {
    if (d <= 28) return [base(item, 'base', item.date, { rrule: `FREQ=MONTHLY;BYMONTHDAY=${d}` })];
    // 29~31일은 달마다 말일로 맞춰야 해서 개별 일정으로 펼친다
    let cursor = nextOccurrence(item, today) ?? item.date;
    for (let i = 0; i < EXPAND_MONTHS; i++) {
      out.push(base(item, `D:${cursor}`, cursor));
      cursor = addMonths(cursor, 1, d);
    }
    return out;
  }
  if (item.repeat === 'yearly') {
    const { m } = parseISODate(item.date);
    if (!(m === 2 && d === 29)) return [base(item, 'base', item.date, { rrule: 'FREQ=YEARLY' })];
    const startYear = parseISODate(today).y;
    for (let y = startYear; y < startYear + LUNAR_YEARS_AHEAD; y++) {
      const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
      const dd = toISODate({ y, m: 2, d: leap ? 29 : 28 });
      if (diffDays(item.date, dd) >= 0) out.push(base(item, `Y:${y}`, dd));
    }
    return out;
  }
  return [base(item, 'base', item.date)];
}

// ── .ics 내보내기 ─────────────────────────────────────

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function utf8Length(s: string): number {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

function icsFold(line: string): string {
  if (utf8Length(line) <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const limit = parts.length === 0 ? 75 : 74;
    const len = utf8Length(ch);
    if (curLen + len > limit) {
      parts.push(cur);
      cur = ch;
      curLen = len;
    } else {
      cur += ch;
      curLen += len;
    }
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

const compactDate = (s: ISODate) => s.replace(/-/g, '');
const compactTime = (t: HHmm) => `${t.replace(':', '')}00`;

export interface IcsSource {
  id: string;
  item: EntryItem;
}

export function buildIcs(sources: readonly IcsSource[], today: ISODate, calendarName = '한지붕'): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//hanjibung//ko',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${icsEscape(calendarName)}`,
    'X-WR-TIMEZONE:Asia/Seoul',
  ];
  const stamp = `${compactDate(today)}T000000Z`;
  for (const { id, item } of sources) {
    for (const e of calendarEntries(item, today)) {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${id}-${e.key.replace(/[^A-Za-z0-9:-]/g, '')}@hanjibung`);
      lines.push(`DTSTAMP:${stamp}`);
      if (e.allDay) {
        lines.push(`DTSTART;VALUE=DATE:${compactDate(e.startDate)}`);
        lines.push(`DTEND;VALUE=DATE:${compactDate(addDays(e.endDate, 1))}`);
      } else {
        lines.push(`DTSTART;TZID=Asia/Seoul:${compactDate(e.startDate)}T${compactTime(e.startTime ?? '00:00')}`);
        lines.push(`DTEND;TZID=Asia/Seoul:${compactDate(e.endDate)}T${compactTime(e.endTime ?? e.startTime ?? '00:00')}`);
      }
      if (e.rrule) lines.push(`RRULE:${e.rrule}`);
      lines.push(`SUMMARY:${icsEscape(e.title)}`);
      if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
      lines.push('END:VEVENT');
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
