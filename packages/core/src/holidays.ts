// 한국 공휴일 계산 (참고용 — 정부 공식 발표와 다를 수 있음)
// 양력 고정 공휴일 + 음력 공휴일 + 대체공휴일 규칙 + 선거일 등 예외 목록.
import { addDays, dayOfWeek, toISODate } from './dates';
import { lunarToSolar } from './lunar';
import type { ISODate } from './types';

export interface Holiday {
  date: ISODate;
  name: string;
  substitute?: boolean;
}

/** 일요일·토요일과 겹치면 대체공휴일이 생기는 공휴일 */
const SUBSTITUTE_ON_WEEKEND = new Set(['삼일절', '어린이날', '부처님오신날', '광복절', '개천절', '한글날', '기독탄신일']);
/** 일요일과 겹칠 때만 대체공휴일이 생기는 공휴일 */
const SUBSTITUTE_ON_SUNDAY = new Set(['설날', '추석']);

/** 법 개정·선거 등 규칙으로 계산하기 어려운 날 */
const EXTRA: Holiday[] = [{ date: '2026-06-03', name: '전국동시지방선거' }];

export function koreanHolidays(year: number): Holiday[] {
  const base: Holiday[] = [];
  const fixed = (m: number, d: number, name: string) => base.push({ date: toISODate({ y: year, m, d }), name });

  fixed(1, 1, '신정');
  fixed(3, 1, '삼일절');
  if (year >= 2026) fixed(5, 1, '노동절');
  fixed(5, 5, '어린이날');
  fixed(6, 6, '현충일');
  if (year >= 2026) fixed(7, 17, '제헌절');
  fixed(8, 15, '광복절');
  fixed(10, 3, '개천절');
  fixed(10, 9, '한글날');
  fixed(12, 25, '기독탄신일');

  const seollal = lunarToSolar(year, { month: 1, day: 1, leap: false });
  if (seollal) {
    base.push({ date: addDays(seollal, -1), name: '설날' });
    base.push({ date: seollal, name: '설날' });
    base.push({ date: addDays(seollal, 1), name: '설날' });
  }
  const buddha = lunarToSolar(year, { month: 4, day: 8, leap: false });
  if (buddha) base.push({ date: buddha, name: '부처님오신날' });
  const chuseok = lunarToSolar(year, { month: 8, day: 15, leap: false });
  if (chuseok) {
    base.push({ date: addDays(chuseok, -1), name: '추석' });
    base.push({ date: chuseok, name: '추석' });
    base.push({ date: addDays(chuseok, 1), name: '추석' });
  }
  for (const h of EXTRA) if (h.date.startsWith(`${year}-`)) base.push(h);

  // 대체공휴일 (2014년 이후 규칙, 어린이날 외 확대는 2021년부터)
  const taken = new Set(base.map((h) => h.date));
  const subs: Holiday[] = [];
  const isOff = (d: ISODate) => taken.has(d) || dayOfWeek(d) === 0 || dayOfWeek(d) === 6;
  const nextWorkday = (d: ISODate) => {
    let c = addDays(d, 1);
    while (isOff(c)) c = addDays(c, 1);
    return c;
  };
  const counts = new Map<ISODate, number>();
  for (const h of base) counts.set(h.date, (counts.get(h.date) ?? 0) + 1);

  const handledLunarBlocks = new Set<string>();
  for (const h of base) {
    const dow = dayOfWeek(h.date);
    let need = false;
    if (SUBSTITUTE_ON_WEEKEND.has(h.name) && year >= 2021) need = dow === 0 || dow === 6 || (counts.get(h.date) ?? 0) > 1;
    if (h.name === '어린이날' && year < 2021 && year >= 2014) need = dow === 0 || dow === 6 || (counts.get(h.date) ?? 0) > 1;
    if (SUBSTITUTE_ON_SUNDAY.has(h.name) && year >= 2014) {
      need = dow === 0 || (counts.get(h.date) ?? 0) > 1;
      if (need) {
        if (handledLunarBlocks.has(h.name)) continue;
        handledLunarBlocks.add(h.name);
      }
    }
    if (!need) continue;
    // 연휴 블록 끝 다음 첫 평일
    let anchor = h.date;
    if (SUBSTITUTE_ON_SUNDAY.has(h.name)) {
      const block = base.filter((b) => b.name === h.name).map((b) => b.date).sort();
      anchor = block[block.length - 1]!;
    }
    const sub = nextWorkday(anchor);
    taken.add(sub);
    subs.push({ date: sub, name: `대체공휴일(${h.name})`, substitute: true });
  }

  return [...base, ...subs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const cache = new Map<number, Map<ISODate, string>>();

/** 그날이 공휴일이면 이름, 아니면 null */
export function holidayName(date: ISODate): string | null {
  const year = Number(date.slice(0, 4));
  let map = cache.get(year);
  if (!map) {
    map = new Map();
    for (const h of koreanHolidays(year)) {
      map.set(h.date, map.has(h.date) ? `${map.get(h.date)}·${h.name}` : h.name);
    }
    cache.set(year, map);
  }
  return map.get(date) ?? null;
}
