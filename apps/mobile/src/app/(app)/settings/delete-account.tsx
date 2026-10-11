// 계정 삭제 (명세서 16장): 지워지는 것 안내 → 공간마다 사진 처리 확인('고르기'면 직접 선택) → DELETE /me → 로그아웃
import type { DeleteMeRequest } from '@hanjibung/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, CheckRow, FieldLabel, IconButton, Note, RadioGroup, Row, Screen, T, TopBar } from '@/components/ui';
import { errorText } from '@/lib/photos/upload';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';

const GONE = ['내가 만든 일정·기념일', "'나만' 공간의 사진", 'Google 캘린더 연동 (구글 권한도 철회)', '이 기기와 다른 기기의 알림 정보', '로그인 계정과 설정'];

export default function DeleteAccount() {
  const { c } = useTheme();
  const { backend, spaces, uid } = useSession();
  const shared = spaces.filter((s) => s.kind === 'shared');
  const askSpaces = shared.filter((s) => s.rules.onLeave === 'ask');
  const [choices, setChoices] = useState<Record<string, 'keep' | 'remove'>>(() => Object.fromEntries(askSpaces.map((s) => [s.id, 'keep' as const])));
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/me'));

  // 마지막 관리자로 남아 있는 공간 (삭제하면 서버가 다른 가족을 관리자로 정한다)
  const lastAdminSpaces = shared.filter((s) => s.adminUids.length === 1 && s.adminUids[0] === uid && s.memberUids.some((m) => m !== uid));

  const remove = async () => {
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const body: DeleteMeRequest = askSpaces.length ? { photoChoices: choices } : {};
      await backend.api('DELETE', '/me', body);
      await backend.signOut();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  const ruleText = (rule: 'keep' | 'remove' | 'ask') =>
    rule === 'keep' ? '내가 올린 사진은 공간에 남고 관리자에게 넘어가요' : rule === 'remove' ? '내가 올린 사진도 함께 지워져요' : '아래에서 골라주세요';

  return (
    <Screen edges={['top', 'bottom']} header={<TopBar left={<IconButton name="chevron-left" label="뒤로" onPress={back} />} title="계정 삭제" />} contentStyle={{ paddingTop: 8, gap: 20 }}>
      <View style={{ gap: 8 }}>
        <T v="title">계정을 삭제하면 되돌릴 수 없어요</T>
        <T v="body" color={c.inkSoft}>
          다음 정보가 모두 삭제돼요.
        </T>
      </View>
      <Card>
        {GONE.map((g, i) => (
          <Row key={g} first={i === 0} label={`· ${g}`} />
        ))}
      </Card>

      {shared.length ? (
        <View style={{ gap: 8 }}>
          <FieldLabel>함께 쓰는 공간의 사진</FieldLabel>
          <Card>
            {shared.map((s, i) => (
              <Row key={s.id} first={i === 0} label={s.name} sub={ruleText(s.rules.onLeave)} />
            ))}
          </Card>
          {askSpaces.map((s) => (
            <RadioGroup
              key={s.id}
              title={`${s.name}: 내가 올린 사진은`}
              value={choices[s.id] ?? 'keep'}
              onChange={(v) => setChoices((x) => ({ ...x, [s.id]: v }))}
              options={[
                { value: 'keep', label: '공간에 남기기 (관리자에게 넘어가요)' },
                { value: 'remove', label: '함께 지우기' },
              ]}
            />
          ))}
          <Note>여러 공간에 함께 공유한 일정은 그 공간들에서 빠져요.</Note>
        </View>
      ) : null}

      {lastAdminSpaces.length ? (
        <Note>
          {lastAdminSpaces.map((s) => s.name).join(', ')} 공간의 마지막 관리자예요. 삭제하면 관리자 권한은 다른 가족에게 넘어가요. 직접 정하려면 공간 관리에서 먼저 지정해 주세요.
        </Note>
      ) : null}

      <Card>
        <CheckRow first label="위 내용을 확인했고 계정을 삭제할게요" checked={confirmed} onPress={() => setConfirmed((v) => !v)} />
      </Card>
      {error ? (
        <T v="caption" color={c.danger}>
          {error}
        </T>
      ) : null}
      <Button label="계정 삭제" kind="danger" onPress={remove} loading={busy} disabled={!confirmed} />
      <Note>웹에서도 같은 방법으로 삭제할 수 있어요.</Note>
    </Screen>
  );
}
