// "누구 일정인가요" — 가족 모두 + 고른 공간의 구성원. 점선 칩은 앱을 쓰지 않는 프로필 구성원.
import type { Member, Participant } from '@hanjibung/core';
import { Pressable, StyleSheet, View } from 'react-native';

import { FieldLabel, Note, T } from '@/components/ui';
import { useSession } from '@/lib/session';
import { fonts, useTheme } from '@/theme';

interface Chip {
  key: string;
  participant: Participant;
  ghost: boolean;
}

/** 같은 사람(계정 구성원)은 공간이 달라도 한 칩으로 */
function keyOf(p: Participant, members: Member[]): string {
  const m = members.find((x) => x.spaceId === p.spaceId && x.id === p.memberId) ?? members.find((x) => x.id === p.memberId);
  return m?.uid ? `u:${m.uid}` : `m:${p.spaceId}:${p.memberId}`;
}

export function ParticipantsPicker({
  value,
  onChange,
  spaceIds,
  disabled,
}: {
  value: Participant[];
  onChange: (next: Participant[]) => void;
  spaceIds: string[];
  disabled?: boolean;
}) {
  const { c } = useTheme();
  const { members } = useSession();

  const chips: Chip[] = [];
  const seen = new Set<string>();
  for (const m of members) {
    if (!spaceIds.includes(m.spaceId)) continue;
    const key = m.uid ? `u:${m.uid}` : `m:${m.spaceId}:${m.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chips.push({ key, ghost: !m.uid, participant: { spaceId: m.spaceId, memberId: m.id, displayName: m.displayName } });
  }
  // 공유 범위를 바꿔도 이미 고른 사람은 보이게 둔다
  for (const p of value) {
    const key = keyOf(p, members);
    if (seen.has(key)) continue;
    seen.add(key);
    chips.push({ key, ghost: key.startsWith('m:'), participant: p });
  }
  const selected = new Set(value.map((p) => keyOf(p, members)));
  const all = value.length === 0;

  const toggle = (chip: Chip) => {
    if (selected.has(chip.key)) onChange(value.filter((p) => keyOf(p, members) !== chip.key));
    else onChange([...value, chip.participant]);
  };

  const render = (key: string, label: string, on: boolean, ghost: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={ghost ? `${label} (앱을 쓰지 않는 가족)` : label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        on
          ? { backgroundColor: c.primary, borderColor: c.primary }
          : { backgroundColor: c.surface, borderColor: ghost ? c.muted : c.border, borderStyle: ghost ? 'dashed' : 'solid' },
        (pressed || disabled) && { opacity: 0.6 },
      ]}>
      <T v="label" color={on ? c.onPrimary : c.ink} style={{ fontFamily: on ? fonts.semibold : fonts.medium }}>
        {label}
      </T>
    </Pressable>
  );

  return (
    <View style={{ gap: 8 }}>
      <FieldLabel>누구 일정인가요</FieldLabel>
      <View style={styles.wrap}>
        {render('all', '가족 모두', all, false, () => onChange([]))}
        {chips.map((ch) => render(ch.key, ch.participant.displayName, selected.has(ch.key), ch.ghost, () => toggle(ch)))}
      </View>
      {chips.some((ch) => ch.ghost) ? <Note>점선은 앱을 쓰지 않는 가족이에요. 일정에 이름만 표시됩니다.</Note> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
