// 알림 여러 개: 당일·1일 전·3일 전·7일 전 + 직접 지정(N일 전·N시간 전), 알림 시각 (명세서 4장)
import type { Reminder } from '@hanjibung/core';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Card, FieldLabel, Icon, Note, T, TextButton } from '@/components/ui';
import { fonts, radius, space, useTheme } from '@/theme';

import { TimeRow } from './DateField';
import { normalizeTime, reminderLabel, TIME_RE } from './format';

const PRESETS = [0, 1, 3, 7];

function sameReminder(a: Reminder, b: Reminder): boolean {
  return (a.hoursBefore ?? null) === (b.hoursBefore ?? null) && (a.hoursBefore != null || a.daysBefore === b.daysBefore);
}

function sorted(list: Reminder[]): Reminder[] {
  // 먼 것부터: 7일 전 → 당일 → N시간 전
  const rank = (r: Reminder) => (r.hoursBefore != null ? -r.hoursBefore / 100 : r.daysBefore);
  return [...list].sort((a, b) => rank(b) - rank(a));
}

export function ReminderEditor({
  value,
  onChange,
  timed,
  defaultTime,
}: {
  value: Reminder[];
  onChange: (next: Reminder[]) => void;
  /** 시각이 있는 일정이면 'N시간 전'도 고를 수 있다 */
  timed: boolean;
  defaultTime: string;
}) {
  const { c } = useTheme();
  const dayBased = value.filter((r) => r.hoursBefore == null);
  const [timeText, setTimeText] = useState(dayBased[0]?.time ?? defaultTime);
  const time = TIME_RE.test(normalizeTime(timeText)) ? normalizeTime(timeText) : (dayBased[0]?.time ?? defaultTime);
  const [n, setN] = useState('');
  const [unit, setUnit] = useState<'day' | 'hour'>('day');
  const [error, setError] = useState<string | null>(null);

  const has = (r: Reminder) => value.some((x) => sameReminder(x, r));
  const toggle = (r: Reminder) => onChange(sorted(has(r) ? value.filter((x) => !sameReminder(x, r)) : [...value, r]));

  const onTime = (t: string) => {
    setTimeText(t);
    const norm = normalizeTime(t);
    if (TIME_RE.test(norm)) onChange(value.map((r) => (r.hoursBefore == null ? { ...r, time: norm } : r)));
  };

  const addCustom = () => {
    const num = Number(n);
    const max = unit === 'day' ? 365 : 72;
    if (!Number.isInteger(num) || num < 1 || num > max) {
      setError(unit === 'day' ? '1~365일 사이로 입력해 주세요' : '1~72시간 사이로 입력해 주세요');
      return;
    }
    const r: Reminder = unit === 'day' ? { daysBefore: num, time } : { daysBefore: 0, time, hoursBefore: num };
    if (!has(r)) onChange(sorted([...value, r]));
    setN('');
    setError(null);
  };

  const customs = value.filter((r) => r.hoursBefore != null || !PRESETS.includes(r.daysBefore));
  const timeBad = timeText.length > 0 && !TIME_RE.test(normalizeTime(timeText));

  return (
    <View style={{ gap: 8 }}>
      <FieldLabel>알림</FieldLabel>
      <Card>
        <View style={styles.chips}>
          {PRESETS.map((d) => {
            const r: Reminder = { daysBefore: d, time };
            const on = has(r);
            return (
              <Pressable
                key={d}
                accessibilityRole="checkbox"
                aria-checked={on}
                accessibilityLabel={`${reminderLabel(r)} 알림`}
                onPress={() => toggle(r)}
                style={[styles.chip, on ? { backgroundColor: c.primary, borderColor: c.primary } : { borderColor: c.border, backgroundColor: c.surface }]}>
                <T v="label" color={on ? c.onPrimary : c.ink} style={{ fontFamily: on ? fonts.semibold : fonts.medium }}>
                  {reminderLabel(r)}
                </T>
              </Pressable>
            );
          })}
          {customs.map((r) => (
            <Pressable
              key={`${r.daysBefore}-${r.hoursBefore ?? ''}`}
              accessibilityRole="button"
              accessibilityLabel={`${reminderLabel(r)} 알림 빼기`}
              onPress={() => toggle(r)}
              style={[styles.chip, { backgroundColor: c.primary, borderColor: c.primary, flexDirection: 'row', gap: 4 }]}>
              <T v="label" color={c.onPrimary} style={{ fontFamily: fonts.semibold }}>
                {reminderLabel(r)}
              </T>
              <Icon name="x" size={14} color={c.onPrimary} />
            </Pressable>
          ))}
        </View>
        <View style={[styles.custom, { borderTopColor: c.line }]}>
          <T v="label" muted style={{ fontFamily: fonts.regular, fontSize: 14 }}>
            직접 지정
          </T>
          <View style={{ flex: 1 }} />
          <TextInput
            value={n}
            onChangeText={(t) => setN(t.replace(/\D/g, ''))}
            keyboardType="number-pad"
            maxLength={3}
            placeholder="N"
            placeholderTextColor={c.muted}
            accessibilityLabel={unit === 'day' ? '며칠 전' : '몇 시간 전'}
            style={[styles.nInput, { color: c.ink, borderColor: error ? c.danger : c.border, backgroundColor: c.bg }]}
          />
          {timed ? (
            <View style={[styles.unit, { backgroundColor: c.surfaceAlt }]}>
              {(['day', 'hour'] as const).map((u) => (
                <Pressable
                  key={u}
                  accessibilityRole="radio"
                  aria-checked={unit === u}
                  onPress={() => setUnit(u)}
                  style={[styles.unitBtn, unit === u && { backgroundColor: c.surface }]}>
                  <T v="label" style={{ fontSize: 13, fontFamily: unit === u ? fonts.bold : fonts.medium }}>
                    {u === 'day' ? '일 전' : '시간 전'}
                  </T>
                </Pressable>
              ))}
            </View>
          ) : (
            <T v="label">일 전</T>
          )}
          <TextButton label="추가" strong onPress={addCustom} disabled={!n} />
        </View>
        {error ? (
          <T v="caption" color={c.danger} style={{ paddingHorizontal: space.lg, paddingBottom: 10, marginTop: -6 }}>
            {error}
          </T>
        ) : null}
        {dayBased.length > 0 || value.length === 0 ? (
          <TimeRow label="알림 시각" value={timeText} onChange={onTime} error={timeBad ? '시각은 09:00처럼 입력해 주세요' : null} />
        ) : null}
      </Card>
      <Note>
        {Platform.OS === 'web'
          ? '웹에서는 알림이 울리지 않아요. 안드로이드 앱에서 앞으로 60일 동안의 알림을 받아요.'
          : value.length === 0
            ? '알림을 끄면 이 항목은 알려드리지 않아요.'
            : '이 폰에서 앞으로 60일 동안의 알림을 미리 맞춰 둬요.'}
      </Note>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: space.lg, paddingBottom: 12 },
  chip: { height: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  custom: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: space.lg, paddingRight: space.sm, paddingVertical: 6, borderTopWidth: 1, minHeight: 56 },
  nInput: { width: 56, minHeight: 44, borderWidth: 1, borderRadius: radius.sm, textAlign: 'center', fontFamily: fonts.medium, fontSize: 16 },
  unit: { flexDirection: 'row', borderRadius: radius.sm, padding: 3, gap: 2 },
  unitBtn: { minHeight: 38, paddingHorizontal: 8, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
});
