// 시간 유틸. 서버는 한국 시간(UTC+9, 서머타임 없음) 기준으로 '오늘'을 계산한다.
import type { HHmm, ISODate } from '@hanjibung/core';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const SEOUL_OFFSET = 9 * HOUR;

export function seoulDateTime(ms: number): { date: ISODate; time: HHmm } {
  const iso = new Date(ms + SEOUL_OFFSET).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export function seoulToday(ms: number): ISODate {
  return seoulDateTime(ms).date;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
