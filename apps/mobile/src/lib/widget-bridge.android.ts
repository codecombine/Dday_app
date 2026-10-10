// 위젯 갱신 (안드로이드): 저장 데이터를 새로 쓰고 두 위젯을 다시 그리게 한다
import { todayISO, type Item, type Space } from '@hanjibung/core';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { buildWidgetCache, writeWidgetCache } from '@/widgets/cache';
import { LIST, renderWidgetFor, SMALL } from '@/widgets/handler';

let lastKey = '';

export async function updateWidgets(items: Item[], spaces: Space[], pinnedIds: string[]): Promise<void> {
  const cache = buildWidgetCache(items, spaces, pinnedIds);
  // 내용과 날짜가 같으면 다시 그리지 않는다
  const key = `${todayISO()}|${JSON.stringify(cache.items)}|${cache.pinnedIds.join(',')}`;
  if (key === lastKey) return;
  lastKey = key;
  await writeWidgetCache(cache);
  await Promise.all(
    [SMALL, LIST].map((widgetName) =>
      requestWidgetUpdate({ widgetName, renderWidget: (info) => renderWidgetFor(info, cache) }).catch(() => {}),
    ),
  );
}
