// 화면용 항목 선택·정렬 (홈·캘린더·기념일이 함께 씀). 날짜 계산은 core 함수만 쓴다.
import {
  addDays,
  diffDays,
  itemStatus,
  nextOccurrence,
  occurrencesBetween,
  todayISO,
  upcomingMilestones,
  type ISODate,
  type Item,
  type ItemStatus,
} from '@hanjibung/core';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { isSince, spanDays } from './format';

/** 오늘 날짜. 자정이 지나거나 앱으로 돌아오면 바뀐다 */
export function useToday(): ISODate {
  const [today, setToday] = useState(() => todayISO());
  useEffect(() => {
    const check = () => setToday((prev) => {
      const now = todayISO();
      return now === prev ? prev : now;
    });
    const timer = setInterval(check, 60_000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return today;
}

export interface StatusRow {
  item: Item;
  status: ItemStatus;
  pinned: boolean;
}

function byPinnedThenDays(a: StatusRow, b: StatusRow): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  if (a.status.daysUntil !== b.status.daysUntil) return a.status.daysUntil - b.status.daysUntil;
  return a.item.title.localeCompare(b.item.title, 'ko');
}

/** 기념일 목록 (명세서 5.3): 고정 → 가까운 순. 지난 카운트다운은 따로 */
export function anniversaryRows(items: Item[], today: ISODate, pinnedIds: string[]): { upcoming: StatusRow[]; past: StatusRow[] } {
  const rows = items
    .filter((i) => i.kind === 'anniversary')
    .map((item) => ({ item, status: itemStatus(item, today), pinned: pinnedIds.includes(item.id) }));
  const upcoming = rows.filter((r) => !r.status.past).sort(byPinnedThenDays);
  const past = rows.filter((r) => r.status.past).sort((a, b) => b.status.daysUntil - a.status.daysUntil);
  return { upcoming, past };
}

/** 기념일 화면 위쪽 큰 카드: 고정한 '지난 날부터 세기' 항목, 없으면 기념일이 가장 가까운 것 */
export function featureRow(items: Item[], today: ISODate, pinnedIds: string[]): StatusRow | null {
  const since = items.filter(isSince);
  const pinned = pinnedIds.map((id) => since.find((i) => i.id === id)).find((i): i is Item => !!i);
  if (pinned) return { item: pinned, status: itemStatus(pinned, today), pinned: true };
  const rows = since
    .filter((i) => diffDays(i.date, today) >= 0)
    .map((item) => ({ item, status: itemStatus(item, today), pinned: false }))
    .filter((r) => r.status.nextMilestone)
    .sort((a, b) => a.status.daysUntil - b.status.daysUntil);
  return rows[0] ?? null;
}

export interface Occurrence {
  item: Item;
  /** 이 회차의 시작일 */
  date: ISODate;
}

/** 다가오는 일정 n개 (진행 중인 여러 날 일정 포함), 날짜·시각 순 */
export function upcomingEvents(items: Item[], today: ISODate, limit: number): Occurrence[] {
  const out: Occurrence[] = [];
  for (const item of items) {
    if (item.kind !== 'event') continue;
    const span = spanDays(item);
    const next = nextOccurrence(item, addDays(today, -span));
    if (!next) continue;
    if (diffDays(today, addDays(next, span)) < 0) continue;
    out.push({ item, date: next });
  }
  return out.sort(compareOccurrence).slice(0, limit);
}

function timeKey(item: Item): string {
  return item.allDay || !item.time ? '' : item.time;
}

export function compareOccurrence(a: Occurrence, b: Occurrence): number {
  const d = diffDays(b.date, a.date);
  if (d !== 0) return d;
  return timeKey(a.item).localeCompare(timeKey(b.item)) || a.item.title.localeCompare(b.item.title, 'ko');
}

export interface DayEntry {
  item: Item;
  /** 표시 날짜 */
  date: ISODate;
  /** 회차 시작일 (여러 날 일정이면 첫날) */
  start: ISODate;
  /** 지난 날부터 세기 항목의 기념일 이름 ('1,000일', '3주년') */
  milestone: string | null;
}

/** [from, to] 구간의 날짜별 항목 (반복·여러 날·100일 단위 기념일 펼침) */
export function entriesBetween(items: Item[], from: ISODate, to: ISODate): Map<ISODate, DayEntry[]> {
  const map = new Map<ISODate, DayEntry[]>();
  const add = (e: DayEntry) => {
    if (diffDays(from, e.date) < 0 || diffDays(e.date, to) < 0) return;
    const list = map.get(e.date);
    if (list) list.push(e);
    else map.set(e.date, [e]);
  };
  for (const item of items) {
    if (isSince(item)) {
      add({ item, date: item.date, start: item.date, milestone: null });
      if (item.milestones) {
        for (const m of upcomingMilestones(item.date, from, item.countFromOne, 6)) {
          if (diffDays(m.date, to) >= 0) add({ item, date: m.date, start: m.date, milestone: m.label });
        }
      }
      continue;
    }
    const span = spanDays(item);
    for (const start of occurrencesBetween(item, addDays(from, -span), to, 64)) {
      for (let k = 0; k <= span; k++) add({ item, date: addDays(start, k), start, milestone: null });
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      const ak = a.item.kind === 'anniversary' || a.milestone ? 0 : 1;
      const bk = b.item.kind === 'anniversary' || b.milestone ? 0 : 1;
      return ak - bk || timeKey(a.item).localeCompare(timeKey(b.item)) || a.item.title.localeCompare(b.item.title, 'ko');
    });
  }
  return map;
}

