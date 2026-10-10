// 앨범 가로 목록 (+ 새 앨범)
import type { Album, Photo } from '@hanjibung/core';
import { router } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';

import { Icon, T } from '@/components/ui';
import { useSession } from '@/lib/session';
import { spaceLabel } from '@/lib/spaces';
import { fonts, radius, space, useTheme } from '@/theme';

import { PhotoThumb } from './PhotoThumb';

const CARD = 132;

/** 앨범 표지: 정한 표지, 없으면 가장 최근 사진 */
export function albumCover(album: Album, photos: Photo[]): string | null {
  if (album.coverPhotoId && photos.some((p) => p.id === album.coverPhotoId)) return album.coverPhotoId;
  return photos.find((p) => p.albumIds.includes(album.id))?.id ?? null;
}

export function albumMeta(album: Album, photos: Photo[], spaceNames: (ids: string[]) => string): string {
  const n = photos.filter((p) => p.albumIds.includes(album.id)).length;
  return `사진 ${n.toLocaleString()}장 · ${spaceNames(album.spaceIds)}`;
}

export function useSpaceNames() {
  const { spaceById } = useSession();
  return (ids: string[]) =>
    ids
      .map((id) => spaceById[id])
      .filter((s) => !!s)
      .map((s) => spaceLabel(s))
      .join(', ');
}

export function AlbumsRow({ albums, photos }: { albums: Album[]; photos: Photo[] }) {
  const { c, tone } = useTheme();
  const { spaceById } = useSession();
  const names = useSpaceNames();
  const sorted = [...albums].sort((a, b) => b.createdAt - a.createdAt);
  return (
    <FlatList
      horizontal
      data={[...sorted, null]}
      keyExtractor={(a) => a?.id ?? 'new'}
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -space.xl, flexGrow: 0 }}
      contentContainerStyle={{ paddingHorizontal: space.xl, gap: 10 }}
      renderItem={({ item: a }) => {
        if (!a) {
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="새 앨범 만들기"
              onPress={() => router.push('/album/new')}
              style={({ pressed }) => [{ width: CARD, gap: 6 }, pressed && { opacity: 0.7 }]}>
              <View
                style={{
                  width: CARD,
                  height: CARD,
                  borderRadius: radius.md + 2,
                  borderWidth: 1.5,
                  borderStyle: 'dashed',
                  borderColor: c.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}>
                <Icon name="plus" size={24} color={c.muted} />
              </View>
              <T v="label" style={{ fontFamily: fonts.semibold }}>
                새 앨범
              </T>
            </Pressable>
          );
        }
        const cover = albumCover(a, photos);
        const t = tone(spaceById[a.spaceIds[0] ?? '']?.color ?? c.primary);
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${a.name} 앨범, ${albumMeta(a, photos, names)}`}
            onPress={() => router.push({ pathname: '/album/[id]', params: { id: a.id } })}
            style={({ pressed }) => [{ width: CARD, gap: 6 }, pressed && { opacity: 0.7 }]}>
            {cover ? (
              <PhotoThumb id={cover} size={CARD} rounded={radius.md + 2} label={`${a.name} 표지`} />
            ) : (
              <View style={{ width: CARD, height: CARD, borderRadius: radius.md + 2, backgroundColor: t.tint, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="image" size={28} color={t.text} />
              </View>
            )}
            <T v="label" numberOfLines={1} style={{ fontFamily: fonts.semibold }}>
              {a.name}
            </T>
            <T v="caption" muted numberOfLines={1} style={{ fontSize: 12, marginTop: -4 }}>
              {albumMeta(a, photos, names)}
            </T>
          </Pressable>
        );
      }}
    />
  );
}
