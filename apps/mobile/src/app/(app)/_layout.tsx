// 로그인한 사용자만 들어오는 영역. 탭과 그 밖의 모든 화면이 여기 있다.
import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

export default function AppLayout() {
  const { c } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }} />;
}
