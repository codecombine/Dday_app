// 음력 ↔ 양력 변환 (한국천문연구원 기준, korean-lunar-calendar)
import KoreanLunarCalendar from 'korean-lunar-calendar';

import { parseISODate, toISODate } from './dates';
import type { ISODate, LunarDate } from './types';

export const LUNAR_MIN_YEAR = 1900;
export const LUNAR_MAX_YEAR = 2050;

/**
 * 그해 음력 날짜를 양력으로 바꾼다.
 * - 윤달인데 그해에 그 윤달이 없으면 평달로 계산한다.
 * - 그 달에 해당 일이 없으면(작은달의 30일) 말일(29일)로 계산한다.
 * 범위 밖이면 null.
 */
export function lunarToSolar(year: number, lunar: LunarDate): ISODate | null {
  if (year < LUNAR_MIN_YEAR || year > LUNAR_MAX_YEAR) return null;
  const cal = new KoreanLunarCalendar();
  const tries: [number, boolean][] = [];
  for (let day = lunar.day; day >= Math.max(1, lunar.day - 1); day--) {
    if (lunar.leap) tries.push([day, true]);
    tries.push([day, false]);
  }
  for (const [day, leap] of tries) {
    if (cal.setLunarDate(year, lunar.month, day, leap)) {
      const s = cal.getSolarCalendar();
      return toISODate({ y: s.year, m: s.month, d: s.day });
    }
  }
  return null;
}

export interface LunarOfSolar extends LunarDate {
  year: number;
}

export function solarToLunar(date: ISODate): LunarOfSolar | null {
  const { y, m, d } = parseISODate(date);
  const cal = new KoreanLunarCalendar();
  if (!cal.setSolarDate(y, m, d)) return null;
  const l = cal.getLunarCalendar();
  return { year: l.year, month: l.month, day: l.day, leap: !!l.intercalation };
}

export function formatLunar(l: LunarDate): string {
  return `음력 ${l.leap ? '윤' : ''}${l.month}.${l.day}`;
}
