// 웹 카카오 로그인 콜백: ?code=... 를 서버에 넘겨 로그인 토큰으로 바꾼다
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button, Loading, T } from '@/components/ui';
import { kakaoRedirectUri } from '@/lib/backend/kakao-auth';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';

export default function KakaoCallback() {
  const { code, error: kakaoError } = useLocalSearchParams<{ code?: string; error?: string }>();
  const { backend, status } = useSession();
  const { c } = useTheme();
  const [error, setError] = useState<string | null>(kakaoError ? '카카오 로그인이 취소됐어요.' : null);
  const started = useRef(false);

  useEffect(() => {
    if (!code || started.current) return;
    started.current = true;
    backend.completeKakaoRedirect(code, kakaoRedirectUri()).catch((e) => setError(e?.message ?? '카카오 로그인에 실패했어요.'));
  }, [backend, code]);

  useEffect(() => {
    if (status === 'ready') router.replace('/');
  }, [status]);

  if (error) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 16, justifyContent: 'center', backgroundColor: c.bg }}>
        <T>{error}</T>
        <Button label="처음으로" onPress={() => router.replace('/login')} />
      </View>
    );
  }
  return <Loading />;
}
