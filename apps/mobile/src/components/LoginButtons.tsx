// 카카오·구글·이메일 로그인 버튼 묶음 (로그인 화면과 초대 화면이 함께 씀)
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Button, Field, Note, T, TextButton } from '@/components/ui';
import { ApiError } from '@/lib/backend';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';

function KakaoMark({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Path fill={color} d="M12 4C7 4 3 7.1 3 11c0 2.5 1.7 4.7 4.2 5.9L6.4 20l3.6-2.4c.6.1 1.3.1 2 .1 5 0 9-3.1 9-6.9S17 4 12 4z" />
    </Svg>
  );
}

function friendly(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  const code = (e as { code?: string })?.code ?? '';
  if (code.includes('popup-closed') || code.includes('cancel') || code === '-5' || code === 'SIGN_IN_CANCELLED') return '';
  if (code.includes('wrong-password') || code.includes('invalid-credential') || code.includes('user-not-found'))
    return '이메일 또는 비밀번호를 확인해주세요.';
  if (code.includes('email-already-in-use')) return '이미 가입된 이메일이에요. 로그인해주세요.';
  if (code.includes('weak-password')) return '비밀번호는 6자 이상으로 정해주세요.';
  if (code.includes('invalid-email')) return '이메일 주소 형식을 확인해주세요.';
  if (code.includes('network')) return '인터넷 연결을 확인해주세요.';
  return '로그인하지 못했어요. 잠시 후 다시 시도해주세요.';
}

export function LoginButtons() {
  const { backend } = useSession();
  const { c } = useTheme();
  const [busy, setBusy] = useState<'kakao' | 'google' | 'email' | null>(null);
  const [mode, setMode] = useState<'buttons' | 'login' | 'signup' | 'reset'>('buttons');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const run = async (kind: 'kakao' | 'google' | 'email', fn: () => Promise<void>) => {
    setBusy(kind);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      const m = friendly(e);
      if (m) setMessage(m);
    } finally {
      setBusy(null);
    }
  };

  if (mode !== 'buttons') {
    const title = mode === 'signup' ? '이메일로 가입' : mode === 'reset' ? '비밀번호 재설정' : '이메일로 로그인';
    return (
      <View style={{ gap: 12 }}>
        <T v="heading">{title}</T>
        {mode === 'signup' && <Field label="이름 (가족에게 보이는 이름)" value={name} onChangeText={setName} placeholder="예: 엄마" maxLength={20} />}
        <Field label="이메일" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        {mode !== 'reset' && <Field label="비밀번호" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />}
        {message ? <T v="caption" color={c.danger}>{message}</T> : null}
        <Button
          label={mode === 'signup' ? '가입하고 인증 메일 받기' : mode === 'reset' ? '재설정 메일 보내기' : '로그인'}
          loading={busy === 'email'}
          onPress={() =>
            run('email', async () => {
              if (mode === 'signup') {
                if (!name.trim()) throw new ApiError(0, 'name', '이름을 입력해주세요.');
                await backend.signUpWithEmail(email.trim(), password, name.trim());
                setMode('login');
                setMessage('인증 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해주세요.');
              } else if (mode === 'reset') {
                await backend.sendPasswordReset(email.trim());
                setMode('login');
                setMessage('비밀번호 재설정 메일을 보냈어요.');
              } else {
                await backend.signInWithEmail(email.trim(), password);
              }
            })
          }
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <TextButton label="← 다른 방법으로" onPress={() => { setMode('buttons'); setMessage(null); }} />
          {mode === 'login' && <TextButton label="가입하기" onPress={() => setMode('signup')} />}
          {mode === 'login' && <TextButton label="비밀번호 찾기" onPress={() => setMode('reset')} />}
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {message ? <T v="caption" color={c.danger}>{message}</T> : null}
      <Button kind="kakao" label="카카오로 계속하기" icon={<KakaoMark color={c.onKakao} />} loading={busy === 'kakao'} onPress={() => run('kakao', () => backend.signInWithKakao())} />
      <Button
        kind="secondary"
        label="Google로 계속하기"
        icon={<T v="bodyStrong" color="#1F5FBF" style={{ fontSize: 18 }}>G</T>}
        loading={busy === 'google'}
        onPress={() => run('google', () => backend.signInWithGoogle())}
      />
      <Pressable accessibilityRole="button" onPress={() => setMode('login')} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
        <T v="label" muted>
          이메일로 계속하기
        </T>
      </Pressable>
      <Note>계속하면 이용약관과 개인정보처리방침에 동의하게 됩니다.</Note>
    </View>
  );
}
