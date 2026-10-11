// 위젯용 저장 데이터: 앱이 AsyncStorage에 써 두고, 위젯은 네트워크 없이 이것만 읽어 그린다 (명세서 13장).
// D-n은 그릴 때 그날 기준으로 다시 계산하므로 자정이 지나도 맞다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { itemStatus, formatKoreanDate, type ISODate, type Item, type Space } from '@hanjibung/core';

const CACHE_KEY = 'hanjibung.widget.cache.v1';
const SMALL_PREFIX = 'hanjibung.widget.small.';

export type WidgetItem = Pick<
  Item,
  'id' | 'title' | 'kind' | 'date' | 'repeat' | 'lunar' | 'mode' | 'countFromOne' | 'milestones' | 'endDate'
> & { color: string | null };

export interface WidgetCache {
  updatedAt: number;
  items: WidgetItem[];
  pinnedIds: string[];
}

export const EMPTY_CACHE: WidgetCache = { updatedAt: 0, items: [], pinnedIds: [] };

export function buildWidgetCache(items: Item[], spaces: Space[], pinnedIds: string[]): WidgetCache {
  const color = (ids: string[]) => spaces.find((s) => s.id === ids[0])?.color ?? null;
  return {
    updatedAt: Date.now(),
    pinnedIds: pinnedIds.filter((id) => items.some((i) => i.id === id)),
    items: items
      .filter((i) => i.kind === 'anniversary')
      .map((i) => ({
        id: i.id,
        title: i.title,
        kind: i.kind,
        date: i.date,
        repeat: i.repeat,
        lunar: i.lunar,
        mode: i.mode,
        countFromOne: i.countFromOne,
        milestones: i.milestones,
        endDate: i.endDate,
        color: color(i.spaceIds),
      })),
  };
}

export async function readWidgetCache(): Promise<WidgetCache> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as WidgetCache) : EMPTY_CACHE;
  } catch {
    return EMPTY_CACHE;
  }
}

export async function writeWidgetCache(cache: WidgetCache): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

/** 작은 위젯마다 고른 항목 */
export async function getSmallChoice(widgetId: number): Promise<string | null> {
  return AsyncStorage.getItem(`${SMALL_PREFIX}${widgetId}`);
}

export async function setSmallChoice(widgetId: number, itemId: string): Promise<void> {
  await AsyncStorage.setItem(`${SMALL_PREFIX}${widgetId}`, itemId);
}

export async function removeSmallChoice(widgetId: number): Promise<void> {
  await AsyncStorage.removeItem(`${SMALL_PREFIX}${widgetId}`);
}

export interface WidgetRow {
  id: string;
  title: string;
  headline: string;
  sub: string;
  pinned: boolean;
  daysUntil: number;
}

/** 지난 카운트다운을 뺀 기념일을 고정 → 가까운 순으로 */
export function widgetRows(cache: WidgetCache, today: ISODate): WidgetRow[] {
  return cache.items
    .map((it) => {
      const st = itemStatus(it, today);
      const since = it.mode === 'since' && it.repeat === 'none';
      const sub = since
        ? st.nextMilestone
          ? `${st.nextMilestone.label}까지 ${st.nextMilestone.daysUntil}일`
          : `${formatKoreanDate(it.date, { year: true, weekday: false })}부터`
        : formatKoreanDate(st.nextDate ?? it.date);
      return { id: it.id, title: it.title, headline: st.headline, sub, pinned: cache.pinnedIds.includes(it.id), daysUntil: st.daysUntil, past: st.past };
    })
    .filter((r) => !r.past)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.pinned && b.pinned) return cache.pinnedIds.indexOf(a.id) - cache.pinnedIds.indexOf(b.id);
      return a.daysUntil - b.daysUntil;
    })
    .map(({ past: _past, ...r }) => r);
}

/** 중간 위젯: 고정한 항목 먼저, 모자라면 가까운 항목으로 채워 최대 n개 */
export function listRows(cache: WidgetCache, today: ISODate, n = 4): WidgetRow[] {
  return widgetRows(cache, today).slice(0, n);
}

/** 작은 위젯: 고른 항목, 없으면 첫 고정 항목, 그것도 없으면 가장 가까운 항목 */
export function smallRow(cache: WidgetCache, today: ISODate, chosenId: string | null): WidgetRow | null {
  const rows = widgetRows(cache, today);
  if (chosenId) {
    const chosen = rows.find((r) => r.id === chosenId);
    if (chosen) return chosen;
    // 지난 카운트다운이어도 고른 항목이면 보여준다
    const it = cache.items.find((i) => i.id === chosenId);
    if (it) {
      const st = itemStatus(it, today);
      return { id: it.id, title: it.title, headline: st.headline, sub: formatKoreanDate(st.nextDate ?? it.date), pinned: false, daysUntil: st.daysUntil };
    }
  }
  return rows[0] ?? null;
}
