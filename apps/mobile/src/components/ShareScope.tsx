// "누가 볼 수 있나요" — 공유 범위 선택 (일정 추가·사진 올리기·앨범이 함께 씀)
import { toggleShareSpace, viewerNames } from '@hanjibung/core';
import { View } from 'react-native';

import { Card, CheckRow, FieldLabel, Note, T } from '@/components/ui';
import { useSession } from '@/lib/session';
import { spaceLabel } from '@/lib/spaces';
import { radius, useTheme } from '@/theme';

export function ShareScope({
  value,
  onChange,
  title = '누가 볼 수 있나요',
  note,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  title?: string;
  note?: string;
}) {
  const { spaces, members, personalSpaceId } = useSession();
  const { c } = useTheme();
  const onlyMe = value.length === 1 && value[0] === personalSpaceId;
  const viewers = viewerNames(value, members, personalSpaceId);
  const memberCount = (sid: string) => members.filter((m) => m.spaceId === sid).length;

  return (
    <View style={{ gap: 8 }}>
      <FieldLabel>{title}</FieldLabel>
      <Card>
        {spaces.map((s, i) => (
          <CheckRow
            key={s.id}
            first={i === 0}
            dot={s.color}
            label={s.kind === 'personal' ? '나만 보기' : spaceLabel(s)}
            sub={
              s.kind === 'personal'
                ? '다른 사람에게는 보이지 않아요'
                : members
                    .filter((m) => m.spaceId === s.id)
                    .slice(0, 4)
                    .map((m) => m.displayName)
                    .join(', ') + (memberCount(s.id) > 4 ? ` 외 ${memberCount(s.id) - 4}명` : '')
            }
            checked={value.includes(s.id)}
            onPress={() => onChange(toggleShareSpace(value, s.id, personalSpaceId))}
          />
        ))}
      </Card>
      <View style={{ backgroundColor: c.primaryTint, borderRadius: radius.md, padding: 12, gap: 4 }}>
        <T v="label" color={c.primary} style={{ fontSize: 13 }}>
          {onlyMe ? '나만 볼 수 있어요' : value.length === 0 ? '공유할 공간을 골라주세요' : `볼 수 있는 사람 ${viewers.length}명`}
        </T>
        <T v="caption" color={c.ink}>
          {onlyMe ? '내 화면에만 표시됩니다.' : value.length === 0 ? '공간을 하나 이상 고르거나 나만 보기를 선택하세요.' : viewers.join(', ')}
        </T>
      </View>
      {note ? <Note>{note}</Note> : null}
    </View>
  );
}
