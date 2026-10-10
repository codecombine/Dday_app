// 날짜·시각 입력. 날짜는 달력 창(직접 입력 칸 포함), 시각은 HH:mm 입력 칸.
import { addMonths, formatKoreanDate, isValidISODate, parseISODate, toISODate, type ISODate } from '@hanjibung/core';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { IconButton, T, TextButton } from '@/components/ui';
import { fonts, radius, space, useTheme } from '@/theme';

import { CalendarMonth } from './CalendarMonth';
import { useToday } from './data';
import { normalizeTime, TIME_RE } from './format';

/** 열려 있을 때만 그린다 (열 때마다 현재 값에서 시작) */
function DatePickerModal({
  value,
  title,
  onClose,
  onPick,
  onClear,
}: {
  value: ISODate;
  title: string;
  onClose: () => void;
  onPick: (d: ISODate) => void;
  onClear?: () => void;
}) {
  const { c } = useTheme();
  const today = useToday();
  const [draft, setDraft] = useState(value);
  const [text, setText] = useState(value);
  const [cursor, setCursor] = useState(() => parseISODate(value));

  const choose = (d: ISODate) => {
    setDraft(d);
    setText(d);
    const p = parseISODate(d);
    if (p.y !== cursor.y || p.m !== cursor.m) setCursor(p);
  };
  const move = (n: number) => setCursor(parseISODate(addMonths(toISODate({ y: cursor.y, m: cursor.m, d: 1 }), n)));
  const onText = (t: string) => {
    setText(t);
    const v = t.trim().replace(/[./]/g, '-');
    if (isValidISODate(v)) choose(v);
  };
  const textOk = isValidISODate(text.trim().replace(/[./]/g, '-'));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="닫기" style={[StyleSheet.absoluteFill, { backgroundColor: c.shadow }]} onPress={onClose} />
      <View style={styles.center} pointerEvents="box-none">
        <View style={[styles.sheet, { backgroundColor: c.surface }]}>
          <T v="heading" center>
            {title}
          </T>
          <View style={{ gap: 4 }}>
            <TextInput
              value={text}
              onChangeText={onText}
              placeholder="2026-10-25"
              placeholderTextColor={c.muted}
              accessibilityLabel="날짜 직접 입력 (연-월-일)"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              style={[
                styles.input,
                { color: c.ink, borderColor: textOk ? c.border : c.danger, backgroundColor: c.bg },
              ]}
            />
            <T v="caption" color={textOk ? c.muted : c.danger} style={{ fontSize: 12 }}>
              {textOk ? `${formatKoreanDate(draft, { year: true })} · 연-월-일로 직접 입력할 수도 있어요` : '2026-10-25처럼 입력해 주세요'}
            </T>
          </View>
          <View style={styles.nav}>
            <IconButton name="chevron-left" label="이전 달" size={20} onPress={() => move(-1)} />
            <T v="bodyStrong">{`${cursor.y}년 ${cursor.m}월`}</T>
            <IconButton name="chevron-right" label="다음 달" size={20} onPress={() => move(1)} />
          </View>
          <CalendarMonth year={cursor.y} month={cursor.m} today={today} selected={draft} onSelect={choose} compact />
          <View style={styles.actions}>
            {onClear ? <TextButton label="지우기" danger onPress={onClear} /> : <View />}
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <TextButton label="취소" onPress={onClose} />
              <TextButton label="선택" strong onPress={() => onPick(draft)} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** 카드 안 한 줄: 라벨 + 날짜 값. 누르면 달력 창 */
export function DateRow({
  label,
  value,
  display,
  onChange,
  onClear,
  placeholder = '선택',
  first,
  error,
}: {
  label: string;
  value: ISODate | null;
  display?: string;
  onChange: (d: ISODate) => void;
  onClear?: () => void;
  placeholder?: string;
  first?: boolean;
  error?: string | null;
}) {
  const { c } = useTheme();
  const today = useToday();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${display ?? (value ? formatKoreanDate(value, { year: true }) : placeholder)}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.row, !first && { borderTopWidth: 1, borderTopColor: c.line }, pressed && { opacity: 0.6 }]}>
        <T v="label" muted style={{ fontSize: 14, fontFamily: fonts.regular }}>
          {label}
        </T>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <T v="label" style={{ fontSize: 15, textAlign: 'right' }} color={value ? c.ink : c.muted}>
            {display ?? (value ? formatKoreanDate(value, { year: true }) : placeholder)}
          </T>
          {error ? (
            <T v="caption" color={c.danger} style={{ fontSize: 12 }}>
              {error}
            </T>
          ) : null}
        </View>
      </Pressable>
      {open ? (
        <DatePickerModal
        value={value ?? today}
        title={label}
        onClose={() => setOpen(false)}
        onPick={(d) => {
          setOpen(false);
          onChange(d);
        }}
        onClear={
          onClear && value
            ? () => {
                setOpen(false);
                onClear();
              }
            : undefined
        }
        />
      ) : null}
    </>
  );
}

/** 카드 안 한 줄: 라벨 + HH:mm 입력 칸 */
export function TimeRow({
  label,
  value,
  onChange,
  first,
  error,
  placeholder = '14:00',
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  first?: boolean;
  error?: string | null;
  placeholder?: string;
}) {
  const { c } = useTheme();
  const bad = !!error || (value.length >= 4 && !TIME_RE.test(normalizeTime(value)));
  return (
    <View style={[styles.row, !first && { borderTopWidth: 1, borderTopColor: c.line }]}>
      <T v="label" muted style={{ fontSize: 14, fontFamily: fonts.regular, flex: 1 }}>
        {label}
      </T>
      <View style={{ alignItems: 'flex-end' }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          onBlur={() => onChange(normalizeTime(value))}
          placeholder={placeholder}
          placeholderTextColor={c.muted}
          accessibilityLabel={`${label} (시:분)`}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          style={[styles.timeInput, { color: c.ink, borderColor: bad ? c.danger : c.border, backgroundColor: c.bg }]}
        />
        {error ? (
          <T v="caption" color={c.danger} style={{ fontSize: 12 }}>
            {error}
          </T>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  sheet: { width: '100%', maxWidth: 420, borderRadius: radius.xl, padding: space.lg, gap: space.sm },
  input: { fontFamily: fonts.medium, fontSize: 16, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, minHeight: 44 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg, paddingVertical: 12, minHeight: 52 },
  timeInput: {
    fontFamily: fonts.medium,
    fontSize: 16,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    minHeight: 44,
    width: 96,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
