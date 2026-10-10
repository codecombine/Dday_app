// "중복 사진 n장을 정리할 수 있어요" — 공간 관리자에게만 보인다
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Icon, T } from '@/components/ui';
import { useAdminDedupe } from '@/lib/photos/use-photos';
import { fonts, radius, useTheme } from '@/theme';

export function DedupeBanner() {
  const { c } = useTheme();
  const { removable, similarGroups, bestSpaceId } = useAdminDedupe();
  if (!bestSpaceId || (removable === 0 && similarGroups === 0)) return null;
  const title = removable > 0 ? `중복 사진 ${removable.toLocaleString()}장을 정리할 수 있어요` : `비슷한 사진 ${similarGroups}묶음을 확인해 보세요`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. 관리자가 검토한 뒤 휴지통으로 옮겨요`}
      onPress={() => router.push({ pathname: '/dedupe/[spaceId]', params: { spaceId: bestSpaceId } })}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 14,
          paddingHorizontal: 16,
          backgroundColor: c.surface,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: radius.md + 2,
          minHeight: 64,
        },
        pressed && { opacity: 0.7 },
      ]}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="copy" size={18} color={c.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="label" style={{ fontSize: 14, fontFamily: fonts.semibold }}>
          {title}
        </T>
        <T v="caption" muted style={{ fontSize: 12 }}>
          관리자가 검토한 뒤 휴지통으로 옮겨요
        </T>
      </View>
      <Icon name="chevron-right" size={18} color={c.muted} />
    </Pressable>
  );
}
