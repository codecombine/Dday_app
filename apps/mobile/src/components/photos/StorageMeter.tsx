// 가족 저장공간 사용량 (보이는 사진 용량 합, 무료 10GB 기준)
import type { Photo } from '@hanjibung/core';
import { View } from 'react-native';

import { Card, T } from '@/components/ui';
import { formatBytes } from '@/lib/photos/format';
import { fonts, useTheme } from '@/theme';

const FREE_BYTES = 10 * 1024 ** 3;

export function StorageMeter({ photos }: { photos: Photo[] }) {
  const { c } = useTheme();
  const used = photos.reduce((n, p) => n + (p.bytes || 0), 0);
  const ratio = Math.min(1, used / FREE_BYTES);
  return (
    <Card padded style={{ gap: 8, paddingVertical: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <T v="caption" style={{ fontFamily: fonts.semibold }}>
          가족 저장공간
        </T>
        <T v="caption" muted>
          {formatBytes(used)} 사용 · 무료 10GB
        </T>
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="가족 저장공간 사용량"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
        style={{ height: 6, borderRadius: 3, backgroundColor: c.surfaceAlt, overflow: 'hidden' }}>
        <View style={{ width: `${Math.max(ratio * 100, used > 0 ? 1 : 0)}%`, height: 6, backgroundColor: c.primary }} />
      </View>
    </Card>
  );
}
