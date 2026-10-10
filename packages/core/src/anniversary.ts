// D-Day·기념일 계산 (명세서 5.2)
import {
  addDays,
  addMonths,
  addYears,
  clampToMonth,
  diffDays,
  elapsedYMD,
  formatElapsed,
  parseISODate,
} from './dates';
import { lunarToSolar } from './lunar';
import type { ISODate, Item } from './types';

/** D-n 표기. 0 → 'D-Day', 미래 → 'D-n', 과거 → 'D+n' */
export function formatDday(daysUntil: number): string {
  if (daysUntil === 0) return 'D-Day';
  return daysUntil > 0 ? `D-${daysUntil}` : `D+${-daysUntil}`;
}

/** 지난 날부터 세기: n일째 */
export function dayCount(start: ISODate, today: ISODate, countFromOne: boolean): number {
  return diffDays(start, today) + (countFromOne ? 1 : 0);
}

type OccurrenceInput = Pick<Item, 'date' | 'repeat' | 'lunar'>;

/** 반복 규칙에 따라 today 이후(오늘 포함) 첫 날짜. 반복이 없으면 원래 날짜 */
export function nextOccurrence(item: OccurrenceInput, today: ISODate): ISODate | null {
  const { date, repeat, lunar } = item;
  if (repeat === 'none') return date;
  if (diffDays(today, date) >= 0) {
    // 시작일이 아직 안 왔으면 시작일이 다음 날짜
    if (repeat !== 'yearly' || !lunar) return date;
  }
  const t = parseISODate(today);
  if (repeat === 'yearly') {
    if (lunar) {
      const fromYear = Math.max(t.y, parseISODate(date).y) - 1;
      for (let y = fromYear; y <= fromYear + 3; y++) {
        const s = lunarToSolar(y, lunar);
        if (s && diffDays(today, s) >= 0 && diffDays(date, s) >= 0) return s;
      }
      return null;
    }
    const base = parseISODate(date);
    let cand = clampToMonth(t.y, base.m, base.d);
    if (diffDays(today, cand) < 0) cand = clampToMonth(t.y + 1, base.m, base.d);
    return cand;
  }
  if (repeat === 'monthly') {
    const base = parseISODate(date);
    let cand = clampToMonth(t.y, t.m, base.d);
    if (diffDays(today, cand) < 0) cand = addMonths(cand, 1, base.d);
    return cand;
  }
  // weekly
  const delta = ((diffDays(date, today) % 7) + 7) % 7;
  return delta === 0 ? today : addDays(today, 7 - delta);
}

/** 반복 일정의 [from, to] 구간 발생일 목록 (캘린더·알림용) */
export function occurrencesBetween(item: OccurrenceInput, from: ISODate, to: ISODate, limit = 400): ISODate[] {
  const out: ISODate[] = [];
  if (item.repeat === 'none') {
    if (diffDays(from, item.date) >= 0 && diffDays(item.date, to) >= 0) out.push(item.date);
    return out;
  }
  let cursor = from;
  while (out.length < limit) {
    const next = nextOccurrence(item, cursor);
    if (!next || diffDays(next, to) < 0) break;
    out.push(next);
    cursor = addDays(next, 1);
  }
  return out;
}

export interface Milestone {
  label: string; // '100일', '1주년', '1000일'
  date: ISODate;
  daysUntil: number;
}

/**
 * 지난 날부터 세는 항목의 기념일. 100일 단위, 1000일 단위, 주년.
 * countFromOne이면 100일째 = 시작일 + 99일.
 */
export function upcomingMilestones(start: ISODate, today: ISODate, countFromOne: boolean, count = 3): Milestone[] {
  const offset = countFromOne ? 1 : 0;
  const result: Milestone[] = [];
  const current = dayCount(start, today, countFromOne);
  // 100일 단위 (100, 200, ... 1000, 1100 ...)
  const firstHundred = Math.max(100, Math.ceil(Math.max(current, 1) / 100) * 100);
  for (let n = firstHundred, i = 0; i < count + 2; n += 100, i++) {
    const date = addDays(start, n - offset);
    result.push({ label: `${n.toLocaleString('ko-KR')}일`, date, daysUntil: diffDays(today, date) });
  }
  // 주년
  const startYMD = parseISODate(start);
  const t = parseISODate(today);
  for (let k = Math.max(1, t.y - startYMD.y); k <= t.y - startYMD.y + count; k++) {
    const date = addYears(start, k);
    const label = k === 1 ? '1주년' : `${k}주년`;
    result.push({ label, date, daysUntil: diffDays(today, date) });
  }
  return result
    .filter((m) => m.daysUntil >= 0)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .filter((m, i, arr) => i === 0 || !(arr[i - 1]!.date === m.date && arr[i - 1]!.label === m.label))
    .slice(0, count);
}

export interface ItemStatus {
  /** 목록 오른쪽 큰 글자: 'D-13', 'D-Day', 'D+15', '987일째' */
  headline: string;
  /** 정렬·필터용: 다음 날짜까지 남은 일수 (지난 카운트다운은 음수) */
  daysUntil: number;
  /** 다음 발생일 (반복이면 다음 회차) */
  nextDate: ISODate | null;
  /** 날짜가 지난 카운트다운 → '지난 항목'으로 접기 */
  past: boolean;
  /** 지난 날부터 세기: 경과 기간 표시 */
  elapsed: string | null;
  /** 가장 가까운 기념일 */
  nextMilestone: Milestone | null;
}

export function itemStatus(
  item: Pick<Item, 'kind' | 'date' | 'repeat' | 'lunar' | 'mode' | 'countFromOne' | 'milestones' | 'endDate'>,
  today: ISODate,
): ItemStatus {
  if (item.kind === 'anniversary' && item.mode === 'since' && item.repeat === 'none') {
    const n = dayCount(item.date, today, item.countFromOne);
    const ms = item.milestones ? upcomingMilestones(item.date, today, item.countFromOne, 1) : [];
    const future = diffDays(today, item.date) > 0;
    return {
      headline: future ? formatDday(diffDays(today, item.date)) : `${n.toLocaleString('ko-KR')}일째`,
      daysUntil: ms[0]?.daysUntil ?? 0,
      nextDate: ms[0]?.date ?? null,
      past: false,
      elapsed: future ? null : formatElapsed(elapsedYMD(item.date, today)),
      nextMilestone: ms[0] ?? null,
    };
  }
  const next = nextOccurrence(item, today);
  if (!next) {
    return { headline: '-', daysUntil: Number.POSITIVE_INFINITY, nextDate: null, past: false, elapsed: null, nextMilestone: null };
  }
  const until = diffDays(today, next);
  // 여러 날 일정은 종료일까지 진행 중으로 본다
  const endUntil = item.endDate ? diffDays(today, item.endDate) : until;
  const ongoing = until < 0 && endUntil >= 0;
  return {
    headline: ongoing ? '진행 중' : formatDday(until),
    daysUntil: ongoing ? 0 : until,
    nextDate: next,
    past: item.repeat === 'none' && until < 0 && !ongoing,
    elapsed: null,
    nextMilestone: null,
  };
}
