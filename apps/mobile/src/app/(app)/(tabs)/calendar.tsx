// 캘린더: 월간 보기 + 고른 날의 일정 목록 (명세서 6장). 위쪽에서 .ics로 내보낸다 (11장).
import {
  addMonths,
  formatKoreanDate,
  holidayName,
  parseISODate,
  toISODate,
  daysInMonth,
  type ISODate,
} from '@hanjibung/core';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Platform, View } from 'react-native';

import { CalendarMonth } from '@/components/schedule/CalendarMonth';
import { entriesBetween, useToday } from '@/components/schedule/data';
import { DayEntryRow, HolidayRow } from '@/components/schedule/ItemRow';
import { Card, ChipBar, Fab, IconButton, Row, Screen, Section, T, TextButton } from '@/components/ui';
import { exportIcs } from '@/lib/ics';
import { useSession } from '@/lib/session';
import { ALL, inFilter, spaceChips } from '@/lib/spaces';
import { space, useTheme } from '@/theme';

export default function CalendarScreen() {
  const { c, tone } = useTheme();
  const { items, spaces, spaceById } = useSession();
  const today = useToday();
  const [filter, setFilter] = useState(ALL);
  const [selected, setSelected] = useState<ISODate>(today);
  const [cursor, setCursor] = useState(() => {
    const { y, m } = parseISODate(today);
    return { y, m };
  });
  const [exporting, setExporting] = useState(false);

  const visible = useMemo(() => inFilter(items, filter), [items, filter]);
  const from = toISODate({ y: cursor.y, m: cursor.m, d: 1 });
  const to = toISODate({ y: cursor.y, m: cursor.m, d: daysInMonth(cursor.y, cursor.m) });
  const byDay = useMemo(() => entriesBetween(visible, from, to), [visible, from, to]);

  const dotsFor = useCallback(
    (date: ISODate) => {
      const colors: string[] = [];
      for (const e of byDay.get(date) ?? []) {
        for (const sid of e.item.spaceIds) {
          if (filter !== ALL && sid !== filter) continue;
          const col = spaceById[sid]?.color;
          if (!col) continue;
          const dot = tone(col).dot;
          if (!colors.includes(dot)) colors.push(dot);
          if (colors.length >= 3) return colors;
        }
      }
      return colors;
    },
    [byDay, filter, spaceById, tone],
  );
  const countFor = useCallback((date: ISODate) => byDay.get(date)?.length ?? 0, [byDay]);

  const move = (n: number) => {
    const next = parseISODate(addMonths(toISODate({ y: cursor.y, m: cursor.m, d: 1 }), n));
    setCursor({ y: next.y, m: next.m });
    const t = parseISODate(today);
    setSelected(t.y === next.y && t.m === next.m ? today : toISODate({ y: next.y, m: next.m, d: 1 }));
  };

  const pick = (date: ISODate) => {
    setSelected(date);
    const p = parseISODate(date);
    if (p.y !== cursor.y || p.m !== cursor.m) setCursor({ y: p.y, m: p.m });
  };

  const onExport = async () => {
    setExporting(true);
    try {
      await exportIcs(visible, filter === ALL ? '한지붕' : `한지붕 ${spaceChips(spaces).find((s) => s.id === filter)?.label ?? ''}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '파일을 만들지 못했어요.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('내보내지 못했어요', msg);
    } finally {
      setExporting(false);
    }
  };

  const dayEntries = byDay.get(selected) ?? [];
  const holiday = holidayName(selected);
  const addOnDay = () => router.push({ pathname: '/item/new', params: { date: selected } });
  const isCurrentMonth = (() => {
    const t = parseISODate(today);
    return t.y === cursor.y && t.m === cursor.m;
  })();

  return (
    <Screen contentStyle={{ gap: space.lg }} footer={<Fab label="일정 추가" onPress={addOnDay} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T v="title">{`${cursor.y}년 ${cursor.m}월`}</T>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {!isCurrentMonth ? <TextButton label="오늘" onPress={() => pick(today)} /> : null}
          <IconButton name="chevron-left" label="이전 달" size={20} onPress={() => move(-1)} />
          <IconButton name="chevron-right" label="다음 달" size={20} onPress={() => move(1)} />
          <IconButton
            name="download"
            label=".ics 파일로 내보내기"
            size={20}
            color={exporting ? c.muted : undefined}
            onPress={() => {
              if (!exporting) void onExport();
            }}
          />
        </View>
      </View>

      <ChipBar options={spaceChips(spaces)} value={filter} onChange={setFilter} />

      <Card style={{ paddingVertical: 12, paddingHorizontal: 8 }}>
        <CalendarMonth
          year={cursor.y}
          month={cursor.m}
          today={today}
          selected={selected}
          onSelect={pick}
          dotsFor={dotsFor}
          countFor={countFor}
        />
      </Card>

      <Section
        title={`${formatKoreanDate(selected)}${selected === today ? ' · 오늘' : ''}`}
        action={dayEntries.length > 0 || holiday ? { label: '일정 추가', onPress: addOnDay } : undefined}>
        {dayEntries.length > 0 || holiday ? (
          <Card>
            {holiday ? <HolidayRow name={holiday} first /> : null}
            {dayEntries.map((e, i) => (
              <DayEntryRow key={`${e.item.id}:${e.milestone ?? e.start}`} entry={e} today={today} first={!holiday && i === 0} />
            ))}
          </Card>
        ) : null}
        {dayEntries.length === 0 && !holiday ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: space.lg, paddingRight: space.sm, minHeight: 64 }}>
            <T v="label" muted>
              이 날은 일정이 없어요
            </T>
            <TextButton label="일정 추가" strong onPress={addOnDay} />
          </Card>
        ) : null}
      </Section>

      {Platform.OS !== 'web' ? (
        <Card>
          <Row first label="폰 캘린더에서 가져오기" onPress={() => router.push('/import-calendar')} />
        </Card>
      ) : null}
    </Screen>
  );
}
