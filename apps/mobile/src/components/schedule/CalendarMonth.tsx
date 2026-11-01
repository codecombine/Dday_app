// 월간 달력 칸 (캘린더 화면과 날짜 고르기 창이 함께 씀). 일요일 시작, 일요일·공휴일 빨강, 토요일 파랑.
import { dayOfWeek, holidayName, monthGrid, parseISODate, WEEKDAY_KO, type ISODate } from '@hanjibung/core';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { T } from '@/components/ui';
import { fonts, useTheme } from '@/theme';

export interface CalendarMonthProps {
  year: number;
  month: number;
  today: ISODate;
  selected: ISODate | null;
  onSelect: (date: ISODate) => void;
  /** 날짜 아래 점 색 (최대 3개) */
  dotsFor?: (date: ISODate) => string[];
  /** 접근성 라벨용 그날 항목 수 */
  countFor?: (date: ISODate) => number;
  /** 날짜 고르기 창처럼 점 없이 낮게 */
  compact?: boolean;
}

export const CalendarMonth = memo(function CalendarMonth({
  year,
  month,
  today,
  selected,
  onSelect,
  dotsFor,
  countFor,
  compact,
}: CalendarMonthProps) {
  const { c } = useTheme();
  const weeks = monthGrid(year, month);
  const cellH = compact ? 44 : 52;

  return (
    <View style={{ gap: 4 }}>
      <View style={styles.week} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {WEEKDAY_KO.map((w, i) => (
          <T
            key={w}
            v="caption"
            center
            color={i === 0 ? c.sunday : i === 6 ? c.saturday : c.muted}
            style={[styles.cell, { fontSize: 12, fontFamily: fonts.medium, paddingBottom: 4 }]}>
            {w}
          </T>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.week}>
          {week.map((date, di) => {
            if (!date) return <View key={di} style={[styles.cell, { height: cellH }]} />;
            const dow = dayOfWeek(date);
            const holiday = holidayName(date);
            const isSel = date === selected;
            const isToday = date === today;
            const color = isSel ? c.onPrimary : dow === 0 || holiday ? c.sunday : dow === 6 ? c.saturday : c.ink;
            const dots = (dotsFor?.(date) ?? []).slice(0, 3);
            const count = countFor?.(date) ?? dots.length;
            const { d } = parseISODate(date);
            const label = `${month}월 ${d}일 ${WEEKDAY_KO[dow]}요일${isToday ? ', 오늘' : ''}${holiday ? `, ${holiday}` : ''}${
              countFor ? `, 일정 ${count}개` : ''
            }`;
            return (
              <Pressable
                key={date}
                accessibilityRole="button"
                accessibilityLabel={label}
                aria-selected={isSel}
                onPress={() => onSelect(date)}
                style={({ pressed }) => [styles.cell, styles.day, { height: cellH, opacity: pressed ? 0.6 : 1 }]}>
                <View
                  style={[
                    styles.num,
                    isSel && { backgroundColor: c.primary },
                    isToday && !isSel && { borderWidth: 1.5, borderColor: c.primary },
                  ]}>
                  <T
                    v="label"
                    color={color}
                    style={{ fontFamily: isSel || isToday ? fonts.bold : fonts.regular, fontVariant: ['tabular-nums'] }}>
                    {d}
                  </T>
                </View>
                {!compact && (
                  <View style={styles.dots}>
                    {dots.map((dc, i) => (
                      <View key={i} style={[styles.dot, { backgroundColor: dc }]} />
                    ))}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  week: { flexDirection: 'row' },
  cell: { flex: 1, minWidth: 0 },
  day: { alignItems: 'center', paddingTop: 4, gap: 3 },
  num: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 3, height: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
