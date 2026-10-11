// 'YYYY-MM-DD' 문자열 기반 날짜 계산. 시간대 영향을 없애려고 내부적으로 UTC 자정만 쓴다.
import type { ISODate } from './types';

const DAY_MS = 86_400_000;

export interface YMD {
  y: number;
  m: number; // 1-12
  d: number;
}

export function parseISODate(s: ISODate): YMD {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`날짜 형식이 올바르지 않습니다: ${s}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function isValidISODate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function toISODate({ y, m, d }: YMD): ISODate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function toUTC(s: ISODate): number {
  const { y, m, d } = parseISODate(s);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): ISODate {
  const dt = new Date(ms);
  return toISODate({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
}

/** 기기 현지 시각 기준 오늘 */
export function todayISO(now: Date = new Date()): ISODate {
  return toISODate({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });
}

export function addDays(s: ISODate, n: number): ISODate {
  return fromUTC(toUTC(s) + n * DAY_MS);
}

/** b - a (일) */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 0 = 일요일 */
export function dayOfWeek(s: ISODate): number {
  return new Date(toUTC(s)).getUTCDay();
}

export const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 월·일을 그 해에 맞춘다 (2월 29일 → 평년 2월 28일, 31일 → 말일) */
export function clampToMonth(y: number, m: number, d: number): ISODate {
  return toISODate({ y, m, d: Math.min(d, daysInMonth(y, m)) });
}

export function addMonths(s: ISODate, n: number, anchorDay?: number): ISODate {
  const { y, m, d } = parseISODate(s);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return clampToMonth(ny, nm, anchorDay ?? d);
}

export function addYears(s: ISODate, n: number): ISODate {
  const { y, m, d } = parseISODate(s);
  return clampToMonth(y + n, m, d);
}

/** "10월 25일 (일)" */
export function formatKoreanDate(s: ISODate, opts: { year?: boolean; weekday?: boolean } = {}): string {
  const { y, m, d } = parseISODate(s);
  const weekday = opts.weekday === false ? '' : ` (${WEEKDAY_KO[dayOfWeek(s)]})`;
  return `${opts.year ? `${y}년 ` : ''}${m}월 ${d}일${weekday}`;
}

/** "2026.10.25" */
export function formatDotDate(s: ISODate): string {
  const { y, m, d } = parseISODate(s);
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`;
}

/** 시작일부터 오늘까지 경과 기간 (n년 n개월 n일) */
export function elapsedYMD(start: ISODate, today: ISODate): YMD {
  const a = parseISODate(start);
  const b = parseISODate(today);
  let y = b.y - a.y;
  let m = b.m - a.m;
  let d = b.d - a.d;
  if (d < 0) {
    m -= 1;
    const prevMonth = b.m === 1 ? 12 : b.m - 1;
    const prevYear = b.m === 1 ? b.y - 1 : b.y;
    d += daysInMonth(prevYear, prevMonth);
  }
  if (m < 0) {
    y -= 1;
    m += 12;
  }
  return { y, m, d };
}

export function formatElapsed({ y, m, d }: YMD): string {
  const parts: string[] = [];
  if (y > 0) parts.push(`${y}년`);
  if (m > 0) parts.push(`${m}개월`);
  parts.push(`${d}일`);
  return parts.join(' ');
}

/** 그 달의 달력 칸 (일요일 시작, 앞뒤 빈칸은 null) */
export function monthGrid(year: number, month: number): (ISODate | null)[][] {
  const first = toISODate({ y: year, m: month, d: 1 });
  const lead = dayOfWeek(first);
  const total = daysInMonth(year, month);
  const cells: (ISODate | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(toISODate({ y: year, m: month, d }));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (ISODate | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
