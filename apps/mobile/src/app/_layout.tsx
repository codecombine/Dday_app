import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Loading } from '@/components/ui';
import { ScheduleSync } from '@/lib/schedule-sync';
import { SessionProvider, useSession } from '@/lib/session';
import { ThemeProvider, useTheme } from '@/theme';
import { useAppFonts } from '@/theme/use-app-fonts';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Navigator() {
  const { status } = useSession();
  const { c, scheme } = useTheme();
  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync().catch(() => {});
  }, [status]);
  if (status === 'loading') return <Loading />;
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <ScheduleSync />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Protected guard={status === 'ready'}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={status !== 'ready'}>
          <Stack.Screen name="login" />
        </Stack.Protected>
        <Stack.Screen name="invite/[token]" />
        <Stack.Screen name="auth/kakao" />
      </Stack>
    </>
  );
}

function Themed() {
  const { settings } = useSession();
  return (
    <ThemeProvider pref={settings.theme}>
      <Navigator />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const fontsLoaded = useAppFonts();
  if (!fontsLoaded) return null;
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <Themed />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
