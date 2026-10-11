// 사진 화면에서 쓰는 표시 도우미 (날짜 묶음, 용량, 올린 사람 이름)
import { formatKoreanDate, holidayName, todayISO, type Member, type Photo } from '@hanjibung/core';

/** 받침이 있으면 a, 없으면 b (한글이 아니면 b) */
export function josa(word: string, a: string, b: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  if (!last || code < 0 || code >= 11172) return `${word}${b}`;
  return `${word}${code % 28 ? a : b}`;
}

/** "아빠가", "외삼촌이" */
export const subject = (name: string) => josa(name, '이', '가');

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)}KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)}MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
}

/** 사진의 기준 시각: 찍은 시각, 없으면 올린 시각 */
export const photoTime = (p: Pick<Photo, 'takenAt' | 'createdAt'>) => p.takenAt ?? p.createdAt;

export const isoOf = (ms: number) => todayISO(new Date(ms));

/** "10월 10일 (토)" — 올해가 아니면 연도, 공휴일이면 이름을 붙인다 */
export function dayLabel(ms: number): string {
  const iso = isoOf(ms);
  const thisYear = new Date().getFullYear() === new Date(ms).getFullYear();
  const holiday = holidayName(iso);
  return `${formatKoreanDate(iso, { year: !thisYear })}${holiday ? ` · ${holiday}` : ''}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "9월 25일 14:02" */
export function dateTimeLabel(ms: number, seconds = false): string {
  const d = new Date(ms);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}${seconds ? `:${pad(d.getSeconds())}` : ''}`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${time}`;
}

export function timeLabel(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** "2026년 9월 25일 (금) 14:02" */
export function fullDateTime(ms: number): string {
  const d = new Date(ms);
  return `${formatKoreanDate(isoOf(ms), { year: true })} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 올린 사람 이름 (공간마다 이름이 다를 수 있어 첫 번째 계정 구성원 이름) */
export function personName(members: Member[], uid: string, meUid: string, myName?: string): string {
  if (uid === meUid && myName) return myName;
  return members.find((m) => m.uid === uid)?.displayName ?? '가족';
}

export interface DayGroup {
  key: string;
  label: string;
  photos: Photo[];
}

/** 찍은 날짜(없으면 올린 날짜)별로 묶는다. 최신 날짜가 위 */
export function groupByDay(photos: Photo[]): DayGroup[] {
  const sorted = [...photos].sort((a, b) => photoTime(b) - photoTime(a));
  const out: DayGroup[] = [];
  let cur: DayGroup | null = null;
  for (const p of sorted) {
    const key = isoOf(photoTime(p));
    if (!cur || cur.key !== key) {
      cur = { key, label: dayLabel(photoTime(p)), photos: [] };
      out.push(cur);
    }
    cur.photos.push(p);
  }
  return out;
}

/** "아빠가 올림" · "엄마 외 2명이 올림" · "나만 보기" */
export function uploaderCaption(photos: Photo[], members: Member[], meUid: string, personalSpaceId: string, myName?: string): string {
  if (photos.every((p) => p.spaceIds.length === 1 && p.spaceIds[0] === personalSpaceId)) return '나만 보기';
  const uids = [...new Set(photos.map((p) => p.ownerUid))];
  const first = personName(members, uids[0]!, meUid, myName);
  if (uids.length === 1) return `${subject(first)} 올림`;
  return `${first} 외 ${uids.length - 1}명이 올림`;
}

/** 찍은 날짜 범위: "9월 25일 ~ 26일" */
export function dateRangeLabel(times: number[]): string | null {
  if (!times.length) return null;
  const min = new Date(Math.min(...times));
  const max = new Date(Math.max(...times));
  const a = `${min.getMonth() + 1}월 ${min.getDate()}일`;
  if (isoOf(min.getTime()) === isoOf(max.getTime())) return a;
  if (min.getFullYear() !== max.getFullYear()) return `${min.getFullYear()}년 ${a} ~ ${max.getFullYear()}년 ${max.getMonth() + 1}월 ${max.getDate()}일`;
  if (min.getMonth() === max.getMonth()) return `${a} ~ ${max.getDate()}일`;
  return `${a} ~ ${max.getMonth() + 1}월 ${max.getDate()}일`;
}

/** 휴지통에서 남은 날 (30일 보관) */
export function daysLeft(trashedAt: number | null, now = Date.now()): number {
  if (!trashedAt) return 30;
  return Math.max(0, 30 - Math.floor((now - trashedAt) / 86_400_000));
}
