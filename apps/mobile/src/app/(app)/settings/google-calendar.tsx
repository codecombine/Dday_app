// Google 캘린더 연동 (명세서 10장): 상태 · 연결 · 반영할 공간 · 해제("한지붕 캘린더도 지울까요?")
import type { GoogleStatus } from '@hanjibung/core';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { useDialog } from '@/components/photos/Sheet';
import { Button, Card, CheckRow, FieldLabel, IconButton, Loading, Note, Screen, T, TopBar } from '@/components/ui';
import { connectGoogleCalendar } from '@/lib/google-calendar';
import { errorText } from '@/lib/photos/upload';
import { useSession } from '@/lib/session';
import { spaceLabel } from '@/lib/spaces';
import { radius, useTheme } from '@/theme';

export default function GoogleCalendarSettings() {
  const { c } = useTheme();
  const { backend, spaces, mySpaceIds } = useSession();
  const dialog = useDialog();
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/me'));

  const load = useCallback(async () => {
    try {
      setStatus(await backend.api<GoogleStatus>('GET', '/calendar/google'));
    } catch (e) {
      setError(errorText(e));
      setStatus({ connected: false, email: null, mirrorSpaceIds: [] });
    }
  }, [backend]);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await connectGoogleCalendar(backend, mySpaceIds));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const mirror = status?.mirrorSpaceIds.length ? status.mirrorSpaceIds : mySpaceIds;
  const toggleSpace = async (id: string) => {
    if (!status) return;
    const next = mirror.includes(id) ? mirror.filter((x) => x !== id) : [...mirror, id];
    if (!next.length) {
      setError('공간을 하나 이상 골라주세요');
      return;
    }
    setError(null);
    setStatus({ ...status, mirrorSpaceIds: next });
    try {
      setStatus(await backend.api<GoogleStatus>('PUT', '/calendar/google/settings', { mirrorSpaceIds: next }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(errorText(e));
      void load();
    }
  };

  const disconnect = async () => {
    const v = await dialog.ask<'delete' | 'keep'>({
      title: 'Google 캘린더 연결을 해제할까요?',
      message: "구글 권한을 철회하고 서버에 저장된 정보를 지워요. 내 구글 캘린더의 '한지붕' 캘린더도 지울까요?",
      options: [
        { label: "'한지붕' 캘린더도 지우기", value: 'delete', kind: 'danger' },
        { label: '캘린더는 남기고 해제', value: 'keep', kind: 'secondary' },
      ],
    });
    if (!v) return;
    setBusy(true);
    setError(null);
    try {
      await backend.api('DELETE', `/calendar/google?deleteCalendar=${v === 'delete' ? 1 : 0}`);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!status) return <Loading />;

  return (
    <Screen edges={['top', 'bottom']} header={<TopBar left={<IconButton name="chevron-left" label="뒤로" onPress={back} />} title="Google 캘린더" />} contentStyle={{ paddingTop: 8, gap: 20 }}>
      <Card padded style={{ gap: 6 }}>
        <T v="bodyStrong">{status.connected ? '연결됨' : '연결 안 됨'}</T>
        <T v="caption" muted>
          {status.connected
            ? `${status.email ?? 'Google 계정'} · '한지붕' 캘린더에 실시간 반영`
            : "연결하면 내 구글 캘린더에 '한지붕' 캘린더를 만들고, 내가 볼 수 있는 일정과 기념일을 넣어요."}
        </T>
      </Card>

      {status.connected ? (
        <View style={{ gap: 8 }}>
          <FieldLabel>반영할 공간</FieldLabel>
          <Card>
            {spaces.map((s, i) => (
              <CheckRow key={s.id} first={i === 0} dot={s.color} label={s.kind === 'personal' ? '나만 보기' : spaceLabel(s)} checked={mirror.includes(s.id)} onPress={() => toggleSpace(s.id)} />
            ))}
          </Card>
          <Note>{saved ? '저장했어요.' : '고른 공간의 일정·기념일이 구글 캘린더에 들어가요. 구글에서 제목·날짜를 고치면 앱에도 반영돼요.'}</Note>
        </View>
      ) : (
        <View style={{ backgroundColor: c.primaryTint, borderRadius: radius.md, padding: 14, gap: 6 }}>
          <T v="label" color={c.primary} style={{ fontSize: 13 }}>
            앱이 만든 캘린더에만 접근해요
          </T>
          <T v="caption" color={c.ink}>
            다른 캘린더의 일정은 읽지 않아요. 가족 전용 앱이라 구글 동의 화면에 &apos;확인되지 않은 앱&apos; 경고가 뜰 수 있어요. &apos;고급&apos;을 눌러 계속하면 돼요.
          </T>
        </View>
      )}

      {error ? (
        <T v="caption" color={c.danger}>
          {error}
        </T>
      ) : null}

      {status.connected ? (
        <Button label="연결 해제" kind="danger" onPress={disconnect} loading={busy} />
      ) : (
        <Button label="Google 캘린더 연결" icon="calendar" onPress={connect} loading={busy} />
      )}
      {dialog.element}
    </Screen>
  );
}
