// 나 (시안 '설정', 명세서 15장): 프로필 · 내 공간 · 사진 · 연동 · 알림 · 화면 · 정보 · 로그아웃 · 계정 삭제
import { isAdmin, type GoogleStatus, type NotifySettings, type ThemePref } from '@hanjibung/core';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Sheet, useDialog } from '@/components/photos/Sheet';
import { Card, CheckRow, FieldLabel, Icon, Note, Row, Screen, Segmented, T, TextButton, ToggleRow } from '@/components/ui';
import { config } from '@/lib/config';
import { autoUploadAvailable, setAutoUploadSchedule } from '@/lib/photos/auto-upload';
import { useMergeRequests } from '@/lib/photos/use-photos';
import { pushAvailable, unregisterPush } from '@/lib/push';
import { useSession } from '@/lib/session';
import { myName, spaceLabel } from '@/lib/spaces';
import { fonts, radius, useTheme } from '@/theme';

const PROVIDER: Record<string, string> = { kakao: '카카오 계정으로 로그인', google: 'Google 계정으로 로그인', password: '이메일로 로그인' };
const TIMES = ['07:00', '08:00', '09:00', '10:00', '12:00', '18:00', '20:00', '21:00'];

function timeText(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${am ? '오전' : '오후'} ${h12}:${String(m).padStart(2, '0')}`;
}

export default function Me() {
  const { c } = useTheme();
  const { backend, me, uid, authUser, spaces, members, settings, updateSettings, personalSpaceId, spaceById } = useSession();
  const dialog = useDialog();
  const mergeRequests = useMergeRequests();
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);

  // 화면에 올 때마다 구글 연결 상태를 새로 받는다
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      backend
        .api<GoogleStatus>('GET', '/calendar/google')
        .then((s) => alive && setGoogle(s))
        .catch(() => alive && setGoogle(null));
      return () => {
        alive = false;
      };
    }, [backend]),
  );

  const name = me?.displayName || myName(members, uid, authUser?.displayName ?? '나');
  const provider = PROVIDER[me?.provider ?? authUser?.provider ?? 'password'] ?? '';
  const auto = settings.autoUpload;
  const adminOfShared = spaces.some((s) => s.kind === 'shared' && isAdmin(s, uid));

  const editName = async () => {
    const next = await dialog.prompt({ title: '이름 바꾸기', message: '가족에게 보이는 내 이름이에요.', initial: name, maxLength: 20, confirmLabel: '저장' });
    if (next && next !== name) await backend.updateUser(uid, { displayName: next });
  };

  const setNotify = (key: keyof NotifySettings, v: boolean) => updateSettings({ notify: { ...settings.notify, [key]: v } });

  const toggleAuto = async (v: boolean) => {
    if (v) {
      router.push({ pathname: '/settings/auto-upload', params: { enable: '1' } });
      return;
    }
    await updateSettings({ autoUpload: { ...auto, enabled: false } });
    await setAutoUploadSchedule(false);
  };

  const signOut = async () => {
    const ok = await dialog.ask({
      title: '로그아웃할까요?',
      message: '이 기기에서 알림이 더 이상 오지 않아요.',
      options: [
        { label: '로그아웃', value: true, kind: 'primary' },
        { label: '취소', value: false, kind: 'ghost' },
      ],
    });
    if (!ok) return;
    await unregisterPush(backend);
    await backend.signOut();
  };

  const open = (path: string) => void WebBrowser.openBrowserAsync(`${config.webOrigin}${path}`).catch(() => {});

  const autoShare = auto.spaceIds.filter((s) => spaceById[s]);
  const autoShareText =
    !autoShare.length || (autoShare.length === 1 && autoShare[0] === personalSpaceId) ? '나만 보기' : autoShare.map((s) => spaceLabel(spaceById[s])).join(', ');
  const conditionText = [auto.wifiOnly ? 'Wi-Fi' : null, auto.chargingOnly ? '충전 중' : null].filter(Boolean).join(' · ') || '항상';

  return (
    <Screen contentStyle={{ gap: 20 }}>
      {/* 프로필 */}
      <Pressable accessibilityRole="button" accessibilityLabel={`${name}, ${provider}. 이름 바꾸기`} onPress={editName} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, opacity: pressed ? 0.7 : 1 })}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
          <T v="title" color={c.onPrimary} style={{ fontSize: 20 }}>
            {name.slice(0, 1)}
          </T>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="heading" style={{ fontSize: 18, fontFamily: fonts.bold }}>
            {name}
          </T>
          <T v="caption" muted>
            {provider}
            {me?.provider === 'password' && authUser?.email ? ` · ${authUser.email}` : ''}
          </T>
        </View>
        <Icon name="edit-2" size={18} color={c.muted} />
      </Pressable>

      {mergeRequests.length ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/merge-requests')}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md + 2, backgroundColor: c.primaryTint, opacity: pressed ? 0.7 : 1 })}>
          <Icon name="git-merge" size={20} color={c.primary} />
          <View style={{ flex: 1 }}>
            <T v="label" color={c.primary} style={{ fontFamily: fonts.semibold }}>
              합치기 확인 요청 {mergeRequests.length}건
            </T>
            <T v="caption" color={c.ink}>
              중복 정리 때문에 내 사진을 다른 공간에도 보이게 할지 확인해 주세요
            </T>
          </View>
          <Icon name="chevron-right" size={18} color={c.primary} />
        </Pressable>
      ) : null}

      {/* 내 공간 */}
      <View style={{ gap: 8 }}>
        <FieldLabel>내 공간</FieldLabel>
        <Card>
          {spaces.map((s, i) => {
            const count = members.filter((m) => m.spaceId === s.id).length;
            const meta = s.kind === 'personal' ? '개인 공간' : `${count}명${isAdmin(s, uid) ? ' · 관리자' : ''}`;
            return (
              <Pressable
                key={s.id}
                accessibilityRole="button"
                accessibilityLabel={`${spaceLabel(s)}, ${meta}`}
                onPress={() => router.push({ pathname: '/space/[id]', params: { id: s.id } })}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.line, opacity: pressed ? 0.6 : 1 })}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
                <T v="label" style={{ flex: 1, fontSize: 15 }}>
                  {spaceLabel(s)}
                </T>
                <T v="caption" muted>
                  {meta}
                </T>
                <Icon name="chevron-right" size={18} color={c.muted} />
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/space/new')}
            style={({ pressed }) => ({ minHeight: 52, borderTopWidth: 1, borderTopColor: c.line, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <T v="label" color={c.primary} style={{ fontFamily: fonts.semibold }}>
              + 새 공간 만들기
            </T>
          </Pressable>
        </Card>
      </View>

      {/* 사진 */}
      <View style={{ gap: 8 }}>
        <FieldLabel>사진</FieldLabel>
        <Card>
          <ToggleRow
            first
            label="새 사진 자동으로 올리기"
            sub={autoUploadAvailable ? '끄면 직접 고른 사진만 올라가요' : '안드로이드 앱에서 쓸 수 있어요'}
            value={auto.enabled && autoUploadAvailable}
            onChange={(v) => (autoUploadAvailable ? void toggleAuto(v) : undefined)}
          />
          {auto.enabled && autoUploadAvailable ? (
            <>
              <Row label="올릴 폴더" value={auto.album ?? '카메라'} onPress={() => router.push('/settings/auto-upload')} />
              <Row label="기본 공개 범위" value={autoShareText} onPress={() => router.push('/settings/auto-upload')} />
              <Row label="올리는 조건" value={conditionText} onPress={() => router.push('/settings/auto-upload')} />
            </>
          ) : null}
          <Row label="폰 사진 전체 가져오기" onPress={() => router.push('/import-photos')} />
          <Row label="휴지통" onPress={() => router.push('/trash')} />
        </Card>
      </View>

      {/* 연동 */}
      <View style={{ gap: 8 }}>
        <FieldLabel>연동</FieldLabel>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Google 캘린더, ${google?.connected ? '연결됨' : '연결 안 됨'}`}
          onPress={() => router.push('/settings/google-calendar')}
          style={({ pressed }) => ({ backgroundColor: c.surface, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, opacity: pressed ? 0.7 : 1 })}>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="label" style={{ fontSize: 15 }}>
              Google 캘린더
            </T>
            <T v="caption" muted style={{ fontSize: 12 }}>
              {google?.connected ? "연결됨 · '한지붕' 캘린더에 실시간 반영" : '연결하면 구글 캘린더에서도 가족 일정을 봐요'}
            </T>
          </View>
          <View style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
            <T v="caption">{google?.connected ? '관리' : '연결'}</T>
          </View>
        </Pressable>
      </View>

      {/* 알림 */}
      <View style={{ gap: 8 }}>
        <FieldLabel>알림</FieldLabel>
        <Card>
          <ToggleRow first label="다가오는 기념일" value={settings.notify.anniversary} onChange={(v) => setNotify('anniversary', v)} />
          <ToggleRow label="가족이 일정을 추가했을 때" value={settings.notify.familyEvent} onChange={(v) => setNotify('familyEvent', v)} />
          <ToggleRow label="새 사진이 올라왔을 때" value={settings.notify.newPhoto} onChange={(v) => setNotify('newPhoto', v)} />
          {adminOfShared ? <ToggleRow label="중복 사진 검토 요청" sub="관리자에게만 와요" value={settings.notify.dedupeReview} onChange={(v) => setNotify('dedupeReview', v)} /> : null}
          <Row label="기본 알림 시각" value={timeText(settings.defaultReminderTime)} onPress={() => setTimeOpen(true)} />
        </Card>
        {!pushAvailable ? <Note>웹에서는 알림이 오지 않아요. 안드로이드 앱에서 받는 알림 설정이에요.</Note> : null}
      </View>

      {/* 화면 */}
      <View style={{ gap: 8 }}>
        <FieldLabel>화면 테마</FieldLabel>
        <Segmented<ThemePref>
          options={[
            { value: 'system', label: '시스템' },
            { value: 'light', label: '라이트' },
            { value: 'dark', label: '다크' },
          ]}
          value={settings.theme}
          onChange={(theme) => updateSettings({ theme })}
        />
      </View>

      {/* 정보 */}
      <View style={{ gap: 8 }}>
        <FieldLabel>정보</FieldLabel>
        <Card>
          <Row first label="이용약관" onPress={() => open('/terms')} />
          <Row label="개인정보처리방침" onPress={() => open('/privacy')} />
          <Row label="버전" value={Constants.expoConfig?.version ?? '1.0.0'} />
        </Card>
      </View>

      <View style={{ gap: 4 }}>
        <TextButton label="로그아웃" onPress={signOut} />
        <TextButton label="계정 삭제" danger onPress={() => router.push('/settings/delete-account')} />
      </View>

      <Sheet visible={timeOpen} onClose={() => setTimeOpen(false)} title="기본 알림 시각">
        <Note>새 일정·기념일의 알림 시각 기본값이에요.</Note>
        <Card>
          {TIMES.map((t, i) => (
            <CheckRow
              key={t}
              first={i === 0}
              label={timeText(t)}
              checked={settings.defaultReminderTime === t}
              onPress={() => {
                void updateSettings({ defaultReminderTime: t });
                setTimeOpen(false);
              }}
            />
          ))}
        </Card>
      </Sheet>
      {dialog.element}
    </Screen>
  );
}
