// 공간 색 고르기와 공간 규칙 (새 공간 만들기·공간 관리에서 함께 쓴다)
import { SPACE_COLORS, type SpaceRules } from '@hanjibung/core';
import { Pressable, View } from 'react-native';

import { Icon, RadioGroup } from '@/components/ui';
import { useTheme } from '@/theme';

const COLOR_NAMES: Record<string, string> = {
  '#0B3040': '남색',
  '#B85C1E': '주황',
  '#2E7D74': '청록',
  '#5B6673': '회색',
  '#7A4BA0': '보라',
  '#1F5FBF': '파랑',
  '#A8326E': '자주',
  '#3F7F2E': '초록',
  '#8A6D1F': '황토',
  '#C23B3B': '빨강',
};

export function ColorPicker({ value, onChange, disabled }: { value: string; onChange: (c: string) => void; disabled?: boolean }) {
  const { c, tone } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="공간 색" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {SPACE_COLORS.map((col) => {
        const on = col.toLowerCase() === value.toLowerCase();
        return (
          <Pressable
            key={col}
            accessibilityRole="radio"
            accessibilityLabel={COLOR_NAMES[col] ?? col}
            aria-checked={on} aria-disabled={disabled}
            disabled={disabled}
            onPress={() => onChange(col)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: on ? 2 : 0,
              borderColor: c.ink,
              opacity: disabled ? 0.6 : 1,
            }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tone(col).dot, alignItems: 'center', justifyContent: 'center' }}>
              {on ? <Icon name="check" size={18} color={c.surface} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function RulesEditor({ rules, onChange, disabled }: { rules: SpaceRules; onChange: (r: SpaceRules) => void; disabled?: boolean }) {
  return (
    <View style={{ gap: 10 }}>
      <RadioGroup
        title="사진 지우기"
        disabled={disabled}
        value={rules.photoDelete}
        onChange={(v) => onChange({ ...rules, photoDelete: v })}
        options={[
          { value: 'owner', label: '올린 사람만' },
          { value: 'ownerOrAdmin', label: '올린 사람과 관리자' },
        ]}
      />
      <RadioGroup
        title="가족이 공간을 나가면 그 사람이 올린 사진은"
        disabled={disabled}
        value={rules.onLeave}
        onChange={(v) => onChange({ ...rules, onLeave: v })}
        options={[
          { value: 'keep', label: '공간에 남기기' },
          { value: 'remove', label: '함께 지우기' },
          { value: 'ask', label: '나가는 사람이 고르기' },
        ]}
      />
      <RadioGroup
        title="일정 수정"
        disabled={disabled}
        value={rules.eventEditDefault}
        onChange={(v) => onChange({ ...rules, eventEditDefault: v })}
        options={[
          { value: 'owner', label: '만든 사람만 (일정마다 바꿀 수 있음)' },
          { value: 'all', label: '구성원 모두' },
        ]}
      />
    </View>
  );
}
