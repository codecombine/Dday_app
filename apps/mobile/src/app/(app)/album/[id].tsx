// 앨범 하나: 공유 범위 · 사진 격자 · 사진 올리기 · (만든 사람) 편집
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { chunk, PhotoRow, useTileSize } from '@/components/photos/PhotoGrid';
import { Button, Empty, IconButton, SpaceTag, T, TextButton, TopBar } from '@/components/ui';
import { personName, photoTime } from '@/lib/photos/format';
import { usePhotos } from '@/lib/photos/use-photos';
import { useSession } from '@/lib/session';
import { myName, tagsFor } from '@/lib/spaces';
import { space, useTheme } from '@/theme';

const COLUMNS = 4;

export default function AlbumDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { albums, spaceById, uid, members, me } = useSession();
  const { photos, loaded } = usePhotos();
  const tile = useTileSize(COLUMNS);
  const album = albums.find((a) => a.id === id);
  const inAlbum = useMemo(() => photos.filter((p) => p.albumIds.includes(id)).sort((a, b) => photoTime(b) - photoTime(a)), [photos, id]);
  const rows = useMemo(() => chunk(inAlbum, COLUMNS), [inAlbum]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/album'));

  if (!album) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <TopBar left={<IconButton name="chevron-left" label="뒤로" onPress={back} />} title="앨범" />
        <View style={{ padding: space.xl }}>
          <Empty text="앨범을 찾을 수 없어요. 지워졌거나 볼 수 없는 앨범이에요." />
        </View>
      </SafeAreaView>
    );
  }

  const isOwner = album.ownerUid === uid;
  const owner = personName(members, album.ownerUid, uid, myName(members, uid, me?.displayName ?? '나'));

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar
        left={<IconButton name="chevron-left" label="뒤로" onPress={back} />}
        title={album.name}
        right={isOwner ? <TextButton label="편집" onPress={() => router.push({ pathname: '/album/new', params: { id: album.id } })} /> : undefined}
      />
      <FlatList
        data={rows}
        keyExtractor={(row) => row.map((p) => p.id).join('-')}
        initialNumToRender={8}
        windowSize={7}
        renderItem={({ item }) => <PhotoRow photos={item} columns={COLUMNS} size={tile} album={album.id} />}
        ListHeaderComponent={
          <View style={{ gap: 12, paddingBottom: 16 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {tagsFor(album.spaceIds, spaceById).map((t) => (
                <SpaceTag key={t.id} name={t.name} color={t.color} />
              ))}
            </View>
            <T v="caption" muted>
              사진 {inAlbum.length.toLocaleString()}장 · {owner} 만듦
            </T>
            <Button label="이 앨범에 사진 올리기" icon="upload" kind="secondary" onPress={() => router.push({ pathname: '/photo/upload', params: { album: album.id } })} />
            {loaded && inAlbum.length === 0 ? <Empty text="아직 이 앨범에 사진이 없어요. 사진을 올리거나, 사진 보기에서 '앨범에 넣기'를 눌러 보세요." /> : null}
          </View>
        }
        contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: 4, paddingBottom: 40, width: '100%', maxWidth: 640, alignSelf: 'center' }}
      />
    </SafeAreaView>
  );
}
