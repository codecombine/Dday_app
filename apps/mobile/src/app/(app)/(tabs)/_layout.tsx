import Feather from '@expo/vector-icons/Feather';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

import { fonts, useTheme } from '@/theme';

type IconName = ComponentProps<typeof Feather>['name'];

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: '홈', icon: 'home' },
  { name: 'calendar', title: '캘린더', icon: 'calendar' },
  { name: 'anniversaries', title: '기념일', icon: 'gift' },
  { name: 'album', title: '앨범', icon: 'image' },
  { name: 'me', title: '나', icon: 'user' },
];

export default function TabsLayout() {
  const { c } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line, height: 64, paddingTop: 6 },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11, paddingBottom: 6 },
        sceneStyle: { backgroundColor: c.bg },
      }}>
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarAccessibilityLabel: t.title,
            tabBarIcon: ({ color }) => <Feather name={t.icon} size={22} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
