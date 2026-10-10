// 사진 격자 한 줄과 칸 크기 계산 (SectionList·FlatList 가상화와 함께 쓴다)
import type { Photo } from '@hanjibung/core';
import { router } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';

import { dayLabel, photoTime } from '@/lib/photos/format';
import { space } from '@/theme';

import { PhotoThumb } from './PhotoThumb';

export const GRID_GAP = 4;
const MAX_CONTENT = 640;

/** 화면 폭에 맞춘 칸 크기 (좌우 여백 20) */
export function useTileSize(columns: number, gap = GRID_GAP, padding = space.xl): number {
  const { width } = useWindowDimensions();
  const content = Math.min(width, MAX_CONTENT) - padding * 2;
  return Math.floor((content - gap * (columns - 1)) / columns);
}

export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** 사진 한 줄. 누르면 전체 화면 보기 (같은 필터·앨범 안에서 넘겨 보기) */
export function PhotoRow({
  photos,
  columns,
  size,
  filter,
  album,
}: {
  photos: Photo[];
  columns: number;
  size: number;
  filter?: string;
  album?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: GRID_GAP, marginBottom: GRID_GAP }}>
      {photos.map((p, i) => (
        <PhotoThumb
          key={p.id}
          id={p.id}
          size={size}
          label={`${dayLabel(photoTime(p))} 사진 ${i + 1}`}
          onPress={() => router.push({ pathname: '/photo/[id]', params: { id: p.id, ...(filter ? { filter } : {}), ...(album ? { album } : {}) } })}
        />
      ))}
      {Array.from({ length: columns - photos.length }, (_, i) => (
        <View key={`pad-${i}`} style={{ width: size, height: size }} />
      ))}
    </View>
  );
}
