// 앨범 탭 (시안 '앨범'): 공간 칩 · 중복 정리 배너(관리자) · 앨범 목록 · 날짜별 사진 · 저장공간
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AlbumsRow } from '@/components/photos/AlbumsRow';
import { DedupeBanner } from '@/components/photos/DedupeBanner';
import { chunk, PhotoRow, useTileSize } from '@/components/photos/PhotoGrid';
import { StorageMeter } from '@/components/photos/StorageMeter';
import { ChipBar, Empty, Loading, T } from '@/components/ui';
import { groupByDay, uploaderCaption } from '@/lib/photos/format';
import { usePhotos } from '@/lib/photos/use-photos';
import { useSession } from '@/lib/session';
import { ALL, inFilter, myName, spaceChips } from '@/lib/spaces';
import { fonts, space, useTheme } from '@/theme';

const COLUMNS = 4;

export default function AlbumTab() {
  const { c } = useTheme();
  const { spaces, albums, members, uid, personalSpaceId, me } = useSession();
  const { photos, loaded } = usePhotos();
  const [filter, setFilter] = useState(ALL);
  const tile = useTileSize(COLUMNS);
  const meName = myName(members, uid, me?.displayName ?? '나');

  const visible = useMemo(() => inFilter(photos, filter), [photos, filter]);
  const sections = useMemo(
    () =>
      groupByDay(visible).map((g) => ({
        key: g.key,
        label: g.label,
        caption: uploaderCaption(g.photos, members, uid, personalSpaceId, meName),
        data: chunk(g.photos, COLUMNS),
      })),
    [visible, members, uid, personalSpaceId, meName],
  );
  const shownAlbums = inFilter(albums, filter);

  if (!loaded && photos.length === 0 && spaces.length === 0) return <Loading />;

  const header = (
    <View style={{ gap: 18, paddingBottom: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T v="title">
          앨범
        </T>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="사진 올리기"
          onPress={() => router.push('/photo/upload')}
          style={({ pressed }) => ({
            minHeight: 44,
            paddingHorizontal: 14,
            borderRadius: 22,
            backgroundColor: c.primary,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            opacity: pressed ? 0.85 : 1,
          })}>
          <Feather name="upload" size={18} color={c.onPrimary} />
          <T v="label" color={c.onPrimary} style={{ fontFamily: fonts.semibold }}>
            올리기
          </T>
        </Pressable>
      </View>
      <ChipBar options={spaceChips(spaces)} value={filter} onChange={setFilter} />
      <DedupeBanner />
      <View style={{ gap: 10 }}>
        <T v="heading">앨범</T>
        <AlbumsRow albums={shownAlbums} photos={photos} />
      </View>
      {loaded && visible.length === 0 ? (
        <Empty
          text={filter === ALL ? '아직 사진이 없어요. 가족과 함께 볼 사진을 올려보세요.' : '이 공간에 공유된 사진이 없어요.'}
          action={{ label: '올리기', onPress: () => router.push('/photo/upload') }}
        />
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <SectionList
        sections={sections}
        keyExtractor={(row) => row.map((p) => p.id).join('-')}
        stickySectionHeadersEnabled={false}
        initialNumToRender={10}
        windowSize={7}
        maxToRenderPerBatch={8}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) => (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, paddingTop: 10, paddingBottom: 8 }}>
            <T v="bodyStrong" style={{ flexShrink: 1 }} numberOfLines={1}>
              {section.label}
            </T>
            <T v="caption" muted style={{ fontSize: 12 }} numberOfLines={1}>
              {section.caption}
            </T>
          </View>
        )}
        renderItem={({ item }) => <PhotoRow photos={item} columns={COLUMNS} size={tile} filter={filter} />}
        ListFooterComponent={
          photos.length > 0 ? (
            <View style={{ paddingTop: 18 }}>
              <StorageMeter photos={photos} />
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: 40, width: '100%', maxWidth: 640, alignSelf: 'center' }}
      />
    </SafeAreaView>
  );
}
