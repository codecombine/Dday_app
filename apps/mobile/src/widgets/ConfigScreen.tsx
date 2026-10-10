// 작은 위젯 설정 화면: 위젯을 놓을 때(또는 다시 설정할 때) 보여줄 기념일 하나를 고른다.
// 앱과 따로 뜨는 화면이라 세션·테마 공급자 없이 저장 데이터와 기본 글꼴만 쓴다.
import { todayISO } from '@hanjibung/core';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import type { WidgetConfigurationScreenProps } from 'react-native-android-widget';

import { dark, light } from '@/theme/colors';

import { getSmallChoice, readWidgetCache, setSmallChoice, smallRow, widgetRows, type WidgetCache, type WidgetRow } from './cache';
import { renderSmall } from './DdayWidgets';

export function WidgetConfigScreen({ widgetInfo, renderWidget, setResult }: WidgetConfigurationScreenProps) {
  const p = useColorScheme() === 'dark' ? dark : light;
  const [cache, setCache] = useState<WidgetCache | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const today = todayISO();

  useEffect(() => {
    void (async () => {
      setCache(await readWidgetCache());
      setChosen(await getSmallChoice(widgetInfo.widgetId));
    })();
  }, [widgetInfo.widgetId]);

  const pick = async (row: WidgetRow) => {
    await setSmallChoice(widgetInfo.widgetId, row.id);
    renderWidget(renderSmall(row));
    setResult('ok');
  };

  const pickDefault = () => {
    if (cache) renderWidget(renderSmall(smallRow(cache, today, null)));
    setResult('ok');
  };

  const rows = cache ? widgetRows(cache, today) : [];

  return (
    <View style={[styles.root, { backgroundColor: p.bg }]}>
      <Text style={[styles.title, { color: p.ink }]}>위젯에 보여줄 기념일</Text>
      <Text style={[styles.sub, { color: p.muted }]}>하나를 고르세요. 위젯을 길게 눌러 언제든 바꿀 수 있어요.</Text>
      {cache && rows.length === 0 ? (
        <View style={[styles.card, { backgroundColor: p.surface, padding: 16 }]}>
          <Text style={{ color: p.muted, fontSize: 15 }}>아직 기념일이 없어요. 한지붕 앱에서 기념일을 추가하면 여기에서 고를 수 있어요.</Text>
        </View>
      ) : (
        <FlatList
          style={[styles.card, { backgroundColor: p.surface }]}
          data={rows}
          keyExtractor={(r) => r.id}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: p.line }} />}
          renderItem={({ item: r }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${r.title}, ${r.headline}`}
              accessibilityState={{ selected: r.id === chosen }}
              onPress={() => void pick(r)}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: p.surfaceAlt }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: p.ink, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
                  {r.title}
                </Text>
                <Text style={{ color: p.muted, fontSize: 13 }} numberOfLines={1}>
                  {r.sub}
                </Text>
              </View>
              <Text style={{ color: p.primary, fontSize: 20, fontWeight: '700' }}>{r.headline}</Text>
            </Pressable>
          )}
        />
      )}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={() => setResult('cancel')} style={styles.btn}>
          <Text style={{ color: p.muted, fontSize: 16 }}>취소</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={pickDefault} style={styles.btn}>
          <Text style={{ color: p.primary, fontSize: 16, fontWeight: '700' }}>가까운 기념일로</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20, paddingTop: 48, paddingBottom: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  sub: { fontSize: 14 },
  card: { borderRadius: 16, flexGrow: 0, maxHeight: '75%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 'auto' },
  btn: { minHeight: 48, minWidth: 64, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
});
