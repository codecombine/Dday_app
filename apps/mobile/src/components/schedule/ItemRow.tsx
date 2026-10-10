// 항목 목록 줄들: 기념일(오른쪽 큰 D-n), 다가오는 일정(왼쪽 요일·날짜), 캘린더 하루 목록(왼쪽 색 막대)
import {
  dayOfWeek,
  formatDday,
  formatKoreanDate,
  formatLunar,
  parseISODate,
  WEEKDAY_KO,
  type ISODate,
  type Item,
} from '@hanjibung/core';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, SpaceTag, T } from '@/components/ui';
import { useSession } from '@/lib/session';
import { tagsFor } from '@/lib/spaces';
import { fonts, radius, space, useTheme } from '@/theme';

import type { DayEntry, StatusRow } from './data';
import { anniversarySub, dateRangeText, eventLine, isSince, spanLabel } from './format';

export function openItem(id: string) {
  router.push({ pathname: '/item/[id]', params: { id } });
}

export function SpaceTags({ spaceIds, vertical }: { spaceIds: string[]; vertical?: boolean }) {
  const { spaceById } = useSession();
  const tags = tagsFor(spaceIds, spaceById);
  if (tags.length === 0) return null;
  return (
    <View style={vertical ? styles.tagsV : styles.tagsH}>
      {tags.map((t) => (
        <SpaceTag key={t.id} name={t.name} color={t.color} />
      ))}
    </View>
  );
}

export function LunarBadge() {
  const { c } = useTheme();
  return (
    <View style={[styles.badge, { borderColor: c.border }]}>
      <T v="tiny" muted style={{ fontFamily: fonts.semibold }}>
        음력
      </T>
    </View>
  );
}

function RowShell({ children, first, onPress, label }: { children: ReactNode; first?: boolean; onPress: () => void; label: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !first && { borderTopWidth: 1, borderTopColor: c.line },
        pressed && { backgroundColor: c.surfaceAlt },
      ]}>
      {children}
    </Pressable>
  );
}

/** 기념일 줄. home이면 '지난 날부터 세기'도 가장 가까운 기념일의 D-n으로 보여준다 */
export function AnniversaryRow({ row, today, first, home }: { row: StatusRow; today: ISODate; first?: boolean; home?: boolean }) {
  const { c } = useTheme();
  const { item, status } = row;
  const since = isSince(item);
  const ms = status.nextMilestone;
  let big = status.headline;
  let sub = anniversarySub(item, status, today);
  if (home) {
    if (since && ms) {
      big = formatDday(ms.daysUntil);
      sub = `${ms.label} · ${formatKoreanDate(ms.date)}`;
    } else if (!since) {
      const next = status.nextDate ?? item.date;
      sub = item.lunar ? `${formatLunar(item.lunar)} · ${formatKoreanDate(next)}` : dateRangeText(item, next);
    }
  }
  return (
    <RowShell first={first} onPress={() => openItem(item.id)} label={`${item.title}, ${big}, ${sub}`}>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={styles.titleLine}>
          {row.pinned && !home ? (
            <View accessibilityLabel="고정됨">
              <Icon name="bookmark" size={14} color={c.primary} />
            </View>
          ) : null}
          <T v="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
            {item.title}
          </T>
          {item.lunar && item.repeat === 'yearly' && !home ? <LunarBadge /> : null}
        </View>
        <T v="caption" muted numberOfLines={2}>
          {sub}
        </T>
        <SpaceTags spaceIds={item.spaceIds} />
      </View>
      <T v="number" color={c.primary}>
        {big}
      </T>
    </RowShell>
  );
}

/** 지난 항목 (흐리게) */
export function PastRow({ row, first }: { row: StatusRow; first?: boolean }) {
  const { item, status } = row;
  return (
    <RowShell first={first} onPress={() => openItem(item.id)} label={`${item.title}, ${status.headline}`}>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <T v="label" muted numberOfLines={1} style={{ fontSize: 15 }}>
          {item.title}
        </T>
        <T v="caption" muted>
          {dateRangeText(item)}
        </T>
      </View>
      <T v="heading" muted style={{ fontSize: 18, fontVariant: ['tabular-nums'] }}>
        {status.headline}
      </T>
    </RowShell>
  );
}

/** 홈의 다가오는 일정 줄: 왼쪽 요일·날짜 */
export function EventRow({ item, date, today, first }: { item: Item; date: ISODate; today: ISODate; first?: boolean }) {
  const { c } = useTheme();
  const { personalSpaceId } = useSession();
  const line = eventLine(item, date, today, personalSpaceId);
  const { d } = parseISODate(date);
  const dow = WEEKDAY_KO[dayOfWeek(date)];
  return (
    <RowShell first={first} onPress={() => openItem(item.id)} label={`${formatKoreanDate(date)} ${item.title}, ${line}`}>
      <View style={styles.dateCol}>
        <T v="caption" color={c.muted} style={{ fontSize: 12 }}>
          {dow}
        </T>
        <T v="heading" style={{ fontSize: 18, fontFamily: fonts.bold, fontVariant: ['tabular-nums'] }}>
          {d}
        </T>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <T v="bodyStrong" numberOfLines={1}>
          {item.title}
        </T>
        {line ? (
          <T v="caption" muted numberOfLines={1}>
            {line}
          </T>
        ) : null}
      </View>
      <SpaceTags spaceIds={item.spaceIds} vertical />
    </RowShell>
  );
}

/** 캘린더 하루 목록 줄: 왼쪽 공간 색 막대 */
export function DayEntryRow({ entry, today, first }: { entry: DayEntry; today: ISODate; first?: boolean }) {
  const { c, tone } = useTheme();
  const { personalSpaceId, spaceById } = useSession();
  const { item } = entry;
  const color = spaceById[item.spaceIds[0] ?? '']?.color ?? c.primary;
  let title = item.title;
  let sub: string;
  if (entry.milestone) {
    title = `${item.title} ${entry.milestone}`;
    sub = '기념일';
  } else if (item.kind === 'anniversary') {
    if (item.lunar && item.repeat === 'yearly') title = `${item.title} (${formatLunar(item.lunar)})`;
    sub = spanLabel(item) ? eventLine(item, entry.start, today, personalSpaceId) : '기념일';
  } else {
    sub = eventLine(item, entry.start, today, personalSpaceId);
  }
  return (
    <RowShell first={first} onPress={() => openItem(item.id)} label={`${title}, ${sub}`}>
      <View style={[styles.bar, { backgroundColor: tone(color).dot }]} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <T v="bodyStrong" numberOfLines={1}>
          {title}
        </T>
        <T v="caption" muted numberOfLines={1}>
          {sub}
        </T>
      </View>
      <SpaceTags spaceIds={item.spaceIds} vertical />
    </RowShell>
  );
}

/** 공휴일 줄 (누를 수 없음) */
export function HolidayRow({ name, first }: { name: string; first?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.row, !first && { borderTopWidth: 1, borderTopColor: c.line }]}>
      <View style={[styles.bar, { backgroundColor: c.sunday }]} />
      <View style={{ flex: 1, gap: 3 }}>
        <T v="bodyStrong">{name}</T>
        <T v="caption" muted>
          공휴일
        </T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg, paddingVertical: 14, minHeight: 56 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tagsH: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tagsV: { gap: 4, alignItems: 'flex-end' },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 0 },
  dateCol: { width: 36, alignItems: 'center' },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: radius.sm / 4 },
});
