// 홈 화면의 "최근 사진" 4장 (공간 칩 필터를 따른다). 누르면 전체 화면 보기
import { router } from 'expo-router';
import { View } from 'react-native';

import { Empty } from '@/components/ui';
import { dayLabel, photoTime } from '@/lib/photos/format';
import { usePhotos } from '@/lib/photos/use-photos';
import { inFilter } from '@/lib/spaces';

import { PhotoThumb } from './PhotoThumb';

export function RecentPhotos({ filter }: { filter: string }) {
  const { photos, loaded } = usePhotos();
  const recent = [...inFilter(photos, filter)]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 4);

  if (loaded && recent.length === 0) {
    return <Empty text="아직 올린 사진이 없어요" action={{ label: '올리기', onPress: () => router.push('/photo/upload') }} />;
  }
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {Array.from({ length: 4 }, (_, i) => {
        const p = recent[i];
        return (
          <View key={p?.id ?? `empty-${i}`} style={{ flex: 1 }}>
            {p ? (
              <PhotoTileLink id={p.id} filter={filter} label={`${dayLabel(photoTime(p))} 사진`} />
            ) : (
              <View style={{ aspectRatio: 1 }} />
            )}
          </View>
        );
      })}
    </View>
  );
}

function PhotoTileLink({ id, filter, label }: { id: string; filter: string; label: string }) {
  return <PhotoThumb id={id} rounded={10} label={label} onPress={() => router.push({ pathname: '/photo/[id]', params: { id, filter } })} />;
}
