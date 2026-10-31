// 웹으로 쓰는 가족에게 앱 설치를 권하는 띠 (안드로이드: 앱 받기, 아이폰: 홈 화면에 추가). 닫으면 그 기기에서는 다시 안 보인다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon, IconButton, T } from '@/components/ui';
import { installTarget } from '@/lib/install';
import { fonts, radius, useTheme } from '@/theme';

const DISMISSED_KEY = 'hanjibung.installBannerDismissed';

const TEXT = {
  android: { title: '안드로이드 앱으로 쓰면 더 편해요', sub: '가족 알림, 사진 자동 올리기, 홈 화면 위젯', icon: 'download' },
  ios: { title: '홈 화면에 추가하면 앱처럼 열려요', sub: 'Safari 공유 버튼 → 홈 화면에 추가', icon: 'plus-square' },
} as const;

export function InstallBanner() {
  const { c } = useTheme();
  const [target] = useState(installTarget);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!target) return;
    AsyncStorage.getItem(DISMISSED_KEY).then(
      (v) => setShow(v !== '1'),
      () => setShow(true),
    );
  }, [target]);

  if (!target || !show) return null;
  const t = TEXT[target];
  const close = () => {
    setShow(false);
    AsyncStorage.setItem(DISMISSED_KEY, '1').catch(() => {});
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 14, borderRadius: radius.md + 2, backgroundColor: c.primaryTint }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/install')}
        style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, opacity: pressed ? 0.7 : 1 })}>
        <Icon name={t.icon} size={20} color={c.primary} />
        <View style={{ flex: 1 }}>
          <T v="label" color={c.primary} style={{ fontFamily: fonts.semibold }}>
            {t.title}
          </T>
          <T v="caption" color={c.ink}>
            {t.sub}
          </T>
        </View>
      </Pressable>
      <IconButton name="x" label="설치 안내 닫기" size={18} color={c.muted} onPress={close} />
    </View>
  );
}
