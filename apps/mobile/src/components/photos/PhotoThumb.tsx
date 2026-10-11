// 사진 한 칸 (서명 주소를 받아 expo-image로 그린다). 주소가 오기 전에는 자리표시
import type { PhotoVariant } from '@hanjibung/core';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/ui';
import { usePhotoUrl } from '@/lib/photos/urls';
import { useTheme } from '@/theme';

export function PhotoThumb({
  id,
  size,
  width,
  height,
  rounded = 6,
  variant = 'thumb',
  label,
  onPress,
  onLongPress,
  dim,
  style,
  children,
  fit = 'cover',
}: {
  id: string;
  /** 정사각형 한 변 */
  size?: number;
  width?: number | `${number}%`;
  height?: number;
  rounded?: number;
  variant?: PhotoVariant;
  label: string;
  onPress?: () => void;
  onLongPress?: () => void;
  dim?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  fit?: 'cover' | 'contain';
}) {
  const { c } = useTheme();
  const url = usePhotoUrl(id, variant);
  const box: ViewStyle = {
    width: size ?? width ?? '100%',
    height: size ?? height,
    aspectRatio: size || height ? undefined : 1,
    borderRadius: rounded,
    overflow: 'hidden',
    backgroundColor: c.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  };
  const inner = (
    <>
      {url ? (
        <Image
          source={{ uri: url }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: dim ? 0.4 : 1 }}
          contentFit={fit}
          transition={120}
          recyclingKey={id}
          accessible={false}
        />
      ) : (
        <Icon name="image" size={18} color={c.muted} />
      )}
      {children}
    </>
  );
  if (!onPress && !onLongPress) {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={label} style={[box, style]}>
        {inner}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [box, style, pressed && { opacity: 0.8 }]}>
      {inner}
    </Pressable>
  );
}
