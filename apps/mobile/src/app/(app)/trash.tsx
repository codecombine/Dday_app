// 휴지통: 내가 지운 사진 (30일 뒤 완전히 삭제). 골라서 되살리기
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { chunk, GRID_GAP, useTileSize } from '@/components/photos/PhotoGrid';
import { PhotoThumb } from '@/components/photos/PhotoThumb';
import { Button, Empty, Icon, IconButton, Loading, Note, T, TextButton, TopBar } from '@/components/ui';
import { daysLeft, dayLabel, photoTime } from '@/lib/photos/format';
import { errorText } from '@/lib/photos/upload';
import { useTrash } from '@/lib/photos/use-photos';
import { useSession } from '@/lib/session';
import { space, useTheme } from '@/theme';

const COLUMNS = 3;

export default function Trash() {
  const { c } = useTheme();
  const { backend } = useSession();
  const { photos, loaded } = useTrash();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const tile = useTileSize(COLUMNS);
  const rows = useMemo(() => chunk(photos, COLUMNS), [photos]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/me'));

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allSelected = photos.length > 0 && selected.length === photos.length;

  const restore = async () => {
    if (!selected.length) return;
    setBusy(true);
    setMessage(null);
    let ok = 0;
    for (const id of selected) {
      try {
        await backend.api('POST', `/photos/${id}/restore`);
        ok++;
      } catch (e) {
        setMessage(errorText(e));
      }
    }
    setSelected([]);
    setBusy(false);
    if (ok) setMessage(`${ok}장을 되살렸어요`);
  };

  if (!loaded) return <Loading />;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar
        left={<IconButton name="chevron-left" label="뒤로" onPress={back} />}
        title="휴지통"
        right={photos.length ? <TextButton label={allSelected ? '선택 해제' : '모두 선택'} onPress={() => setSelected(allSelected ? [] : photos.map((p) => p.id))} /> : undefined}
      />
      <FlatList
        data={rows}
        keyExtractor={(row) => row.map((p) => p.id).join('-')}
        ListHeaderComponent={
          <View style={{ gap: 12, paddingBottom: 12 }}>
            <Note>지운 사진은 30일 동안 여기 있다가 완전히 삭제돼요. 사진을 눌러 고른 뒤 되살릴 수 있어요.</Note>
            {message ? (
              <T v="caption" color={c.primary}>
                {message}
              </T>
            ) : null}
            {photos.length === 0 ? <Empty text="휴지통이 비어 있어요." /> : null}
          </View>
        }
        renderItem={({ item: row }) => (
          <View style={{ flexDirection: 'row', gap: GRID_GAP, marginBottom: GRID_GAP }}>
            {row.map((p) => {
              const on = selected.includes(p.id);
              const left = daysLeft(p.trashedAt);
              return (
                <PhotoThumb
                  key={p.id}
                  id={p.id}
                  size={tile}
                  rounded={8}
                  dim={on}
                  label={`${dayLabel(photoTime(p))} 사진, ${left}일 남음${on ? ', 선택됨' : ''}`}
                  onPress={() => toggle(p.id)}>
                  <View style={{ position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: c.surface }}>
                    <T v="tiny" color={left <= 3 ? c.danger : c.ink}>
                      {left}일 남음
                    </T>
                  </View>
                  {on ? (
                    <View style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="check" size={16} color={c.onPrimary} />
                    </View>
                  ) : null}
                </PhotoThumb>
              );
            })}
          </View>
        )}
        contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: 4, paddingBottom: 24, width: '100%', maxWidth: 640, alignSelf: 'center' }}
      />
      {photos.length ? (
        <View style={{ backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line, paddingHorizontal: space.xl, paddingVertical: 12 }}>
          <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center' }}>
            <Button label={selected.length ? `선택한 ${selected.length}장 되살리기` : '되살릴 사진을 골라주세요'} icon="rotate-ccw" onPress={restore} loading={busy} disabled={!selected.length} />
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
