// 초대 받기 (시안 '초대 받기'). 로그인 전이면 로그인 버튼, 로그인 상태면 바로 참여.
import type { AcceptInviteResponse, InvitePreview } from '@hanjibung/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoginButtons } from '@/components/LoginButtons';
import { Avatar, Button, Icon, Loading, T } from '@/components/ui';
import { useSession } from '@/lib/session';
import { radius, useTheme } from '@/theme';

export default function Invite() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { backend, status, setPendingInvite, refreshMembership, mySpaceIds } = useSession();
  const { c, tone } = useTheme();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    backend
      .api<InvitePreview>('GET', `/invites/${token}`)
      .then(setPreview)
      .catch((e) => setError(e?.message ?? '초대 정보를 불러오지 못했어요.'));
  }, [backend, token]);

  // 로그인하면 자동 수락되도록 미리 저장
  useEffect(() => {
    if (token && status !== 'ready') setPendingInvite(token);
  }, [token, status, setPendingInvite]);

  const alreadyMember = !!preview && mySpaceIds.includes(preview.spaceId);

  const join = async () => {
    setJoining(true);
    try {
      await backend.api<AcceptInviteResponse>('POST', `/invites/${token}/accept`);
      await setPendingInvite(null);
      await refreshMembership();
      router.replace('/');
    } catch (e) {
      setError((e as Error)?.message ?? '참여하지 못했어요.');
    } finally {
      setJoining(false);
    }
  };

  if (!preview && !error) return <Loading />;

  const t = tone(preview?.spaceColor ?? c.primary);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.surface }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 40, gap: 28, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
        <T v="heading" color={c.primary}>
          한지붕
        </T>
        {error || !preview ? (
          <T>{error}</T>
        ) : !preview.valid ? (
          <View style={{ gap: 10 }}>
            <T v="title">초대 링크가 만료됐어요</T>
            <T muted>{preview.inviterName}님에게 새 링크를 부탁해주세요.</T>
          </View>
        ) : (
          <>
            <View style={{ gap: 10 }}>
              <T v="title" style={{ fontSize: 26, lineHeight: 36 }}>
                {preview.inviterName}님이{' '}
                <T v="title" color={t.text} style={{ fontSize: 26, lineHeight: 36 }}>
                  {preview.spaceName}
                </T>{' '}
                공간에{'\n'}초대했어요
              </T>
              <T muted>
                {preview.targetMemberName ? `${preview.targetMemberName}(으)로 참여하게 돼요. ` : ''}
                {status === 'ready' ? '참여하면 바로 함께 볼 수 있어요.' : '가입하면 바로 이 공간에 들어가요. 처음 한 번만 하면 됩니다.'}
              </T>
            </View>
            <View style={{ backgroundColor: c.bg, borderRadius: radius.lg, padding: 18, gap: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.dot }} />
                  <T v="bodyStrong">{preview.spaceName}</T>
                </View>
                <T v="caption" muted>
                  구성원 {preview.memberCount}명
                </T>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                {preview.memberNames.slice(0, 6).map((n, i) => (
                  <View key={`${n}${i}`} style={{ alignItems: 'center', gap: 4, width: 56 }}>
                    <Avatar label={n} color={preview.spaceColor} size={44} />
                    <T v="tiny" muted numberOfLines={1}>
                      {n}
                    </T>
                  </View>
                ))}
              </View>
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Icon name="calendar" size={18} color={c.primary} />
                  <T v="label" style={{ fontWeight: 'normal' }}>
                    공유된 일정·기념일 {preview.itemCount}개
                  </T>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Icon name="image" size={18} color={c.primary} />
                  <T v="label">공유된 사진 {preview.photoCount.toLocaleString('ko-KR')}장</T>
                </View>
              </View>
            </View>
            <View style={{ flex: 1 }} />
            {status === 'ready' ? (
              alreadyMember ? (
                <Button label="이미 참여한 공간이에요 · 홈으로" onPress={() => router.replace('/')} />
              ) : (
                <Button label={`${preview.spaceName} 공간에 참여하기`} loading={joining} onPress={join} />
              )
            ) : (
              <LoginButtons />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
