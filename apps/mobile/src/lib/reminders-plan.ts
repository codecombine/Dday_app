// 일정·기념일 로컬 알림 계획 (명세서 12장): 앞으로 60일 안에 울릴 알림 목록을 만든다. 플랫폼과 무관한 순수 함수.
import {
  addDays,
  diffDays,
  formatKoreanDate,
  occurrencesBetween,
  parseISODate,
  todayISO,
  upcomingMilestones,
  type ISODate,
  type Item,
  type Reminder,
} from '@hanjibung/core';

export const REMINDER_WINDOW_DAYS = 60;
/** 안드로이드 알람 개수 제한(500)보다 넉넉히 적게 */
export const REMINDER_LIMIT = 150;

export interface PlannedReminder {
  /** 같은 알림이면 같은 값 (예약 식별자로 씀) */
  key: string;
  itemId: string;
  at: number;
  title: string;
  body: string;
}

interface Occ {
  date: ISODate;
  milestone: string | null;
}

function localTime(date: ISODate, hhmm: string): Date {
  const { y, m, d } = parseISODate(date);
  const [hh, mm] = hhmm.split(':').map(Number) as [number, number];
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

function isSince(item: Item): boolean {
  return item.kind === 'anniversary' && item.mode === 'since' && item.repeat === 'none';
}

function occurrences(item: Item, today: ISODate, until: ISODate): Occ[] {
  if (isSince(item)) {
    const out: Occ[] = [];
    // 아직 시작 전이면 시작일도 알린다
    if (diffDays(today, item.date) >= 0 && diffDays(item.date, until) >= 0) out.push({ date: item.date, milestone: null });
    if (item.milestones) {
      for (const m of upcomingMilestones(item.date, today, item.countFromOne, 12)) {
        if (diffDays(m.date, until) >= 0) out.push({ date: m.date, milestone: m.label });
      }
    }
    return out;
  }
  return occurrencesBetween(item, today, until, 80).map((date) => ({ date, milestone: null }));
}

function bodyText(item: Item, occ: Occ, r: Reminder): string {
  const timed = !item.allDay && !!item.time;
  if (r.hoursBefore != null) return `${r.hoursBefore}시간 뒤 · ${item.time}`;
  const n = r.daysBefore;
  const date = formatKoreanDate(occ.date);
  if (occ.milestone) {
    if (n === 0) return `오늘이 ${occ.milestone}이에요`;
    return `${n === 1 ? '내일이면' : `${n}일 뒤면`} ${occ.milestone}이에요 · ${date}`;
  }
  if (item.kind === 'anniversary') {
    if (n === 0) return '오늘이에요';
    return n === 1 ? `내일이에요 · ${date}` : `${n}일 남았어요 · ${date}`;
  }
  if (n === 0) return timed ? `오늘 ${item.time}` : '오늘 일정이에요';
  if (n === 1) return timed ? `내일 ${item.time}` : `내일 일정이에요 · ${date}`;
  return `${n}일 뒤 · ${date}${timed ? ` ${item.time}` : ''}`;
}

export function planReminders(
  items: Item[],
  now: Date = new Date(),
  windowDays = REMINDER_WINDOW_DAYS,
  limit = REMINDER_LIMIT,
): PlannedReminder[] {
  const today = todayISO(now);
  const nowMs = now.getTime();
  const endMs = nowMs + windowDays * 86_400_000;
  const out: PlannedReminder[] = [];
  for (const item of items) {
    if (item.reminders.length === 0) continue;
    const maxBefore = Math.max(...item.reminders.map((r) => (r.hoursBefore != null ? Math.ceil(r.hoursBefore / 24) : r.daysBefore)));
    const until = addDays(today, windowDays + maxBefore + 1);
    for (const occ of occurrences(item, today, until)) {
      for (const r of item.reminders) {
        let at: Date;
        if (r.hoursBefore != null) {
          // 'N시간 전'은 시각이 있는 일정에만
          if (item.allDay || !item.time) continue;
          at = new Date(localTime(occ.date, item.time).getTime() - r.hoursBefore * 3_600_000);
        } else {
          at = localTime(addDays(occ.date, -r.daysBefore), r.time);
        }
        const ms = at.getTime();
        if (ms <= nowMs || ms > endMs) continue;
        out.push({
          key: `${item.id}|${occ.date}|${occ.milestone ?? ''}|${r.daysBefore}|${r.hoursBefore ?? ''}|${r.time}`,
          itemId: item.id,
          at: ms,
          title: occ.milestone ? `${item.title} ${occ.milestone}` : item.title,
          body: bodyText(item, occ, r),
        });
      }
    }
  }
  const seen = new Set<string>();
  return out
    .sort((a, b) => a.at - b.at)
    .filter((p) => (seen.has(p.key) ? false : (seen.add(p.key), true)))
    .slice(0, limit);
}

/** 짧은 문자열 해시 (예약 식별자·변경 확인용) */
export function hashString(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 16777619);
    h2 = Math.imul(h2 ^ ch, 2246822519);
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}
