// 새 공용 공간 만들기: 이름(20자) · 색 · 공간 규칙 → POST /spaces → 초대하러 공간 화면으로
import { DEFAULT_SPACE_RULES, SPACE_COLORS, type CreateSpaceRequest, type CreateSpaceResponse, type SpaceRules } from '@hanjibung/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ColorPicker, RulesEditor } from '@/components/spaces/SpaceForm';
import { Button, Field, FieldLabel, Note, Screen, T, TextButton, TopBar } from '@/components/ui';
import { errorText } from '@/lib/photos/upload';
import { askPushPermissionOnce } from '@/lib/push';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';

const MAX_NAME = 20;

export default function NewSpace() {
  const { c } = useTheme();
  const { backend, refreshMembership, spaces } = useSession();
  // 아직 안 쓴 색을 먼저 고른다
  const used = new Set(spaces.map((s) => s.color.toLowerCase()));
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(SPACE_COLORS.find((col) => !used.has(col.toLowerCase())) ?? SPACE_COLORS[0]);
  const [rules, setRules] = useState<SpaceRules>({ ...DEFAULT_SPACE_RULES });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim().length > 0 && name.trim().length <= MAX_NAME;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/me'));

  const create = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await backend.api<CreateSpaceResponse>('POST', '/spaces', { name: name.trim(), color, rules } satisfies CreateSpaceRequest);
      await refreshMembership();
      void askPushPermissionOnce(backend);
      router.replace({ pathname: '/space/[id]', params: { id: res.spaceId } });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      edges={['top', 'bottom']}
      header={
        <TopBar
          left={<TextButton label="취소" onPress={back} />}
          title="새 공간"
          right={<TextButton label="만들기" strong onPress={create} disabled={!valid || saving} />}
        />
      }>
      <View style={{ gap: 6 }}>
        <Field label="공간 이름" placeholder="예: 약수집, 옥수집, 진주집" value={name} onChangeText={setName} maxLength={MAX_NAME} autoFocus />
        <T v="tiny" muted style={{ alignSelf: 'flex-end' }}>
          {name.length}/{MAX_NAME}
        </T>
      </View>
      <View style={{ gap: 10 }}>
        <FieldLabel>색</FieldLabel>
        <ColorPicker value={color} onChange={setColor} />
      </View>
      <View style={{ gap: 10 }}>
        <FieldLabel>공간 규칙 · 나중에 바꿀 수 있어요</FieldLabel>
        <RulesEditor rules={rules} onChange={setRules} />
      </View>
      <Note>만든 사람이 관리자가 돼요. 만든 뒤 카카오톡으로 가족을 초대할 수 있어요.</Note>
      {error ? (
        <T v="caption" color={c.danger}>
          {error}
        </T>
      ) : null}
      <Button label="공간 만들기" onPress={create} loading={saving} disabled={!valid} />
    </Screen>
  );
}
