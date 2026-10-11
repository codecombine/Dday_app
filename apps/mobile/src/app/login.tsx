import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoginButtons } from '@/components/LoginButtons';
import { Button, T } from '@/components/ui';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';

export default function Login() {
  const { c } = useTheme();
  const { status, backend, authUser, error } = useSession();

  if (status === 'unverified') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.surface, padding: 24, gap: 16, justifyContent: 'center' }}>
        <T v="title">이메일 인증이 필요해요</T>
        <T muted>{authUser?.email} 로 보낸 메일의 인증 링크를 누른 뒤 다시 로그인해주세요.</T>
        <Button label="다시 로그인" onPress={() => backend.signOut()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.surface }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center', padding: 24, paddingTop: 56, gap: 28 }}>
        <T v="heading" color={c.primary} style={{ letterSpacing: 0.3 }}>
          한지붕
        </T>
        <View style={{ gap: 10 }}>
          <T v="title" style={{ fontSize: 26, lineHeight: 36 }}>
            가족의 일정과 기념일,{'\n'}사진을 한곳에
          </T>
          <T muted>약수집, 옥수집, 진주집… 집마다 공간을 만들고 필요한 만큼만 함께 봐요.</T>
        </View>
        <View style={{ flex: 1 }} />
        {error ? <T v="caption" color={c.danger}>{error}</T> : null}
        {backend.kind === 'demo' ? (
          <T v="caption" muted>
            지금은 데모 모드예요. 어떤 버튼을 눌러도 예시 가족 데이터로 들어갑니다.
          </T>
        ) : null}
        <LoginButtons />
      </View>
    </SafeAreaView>
  );
}
