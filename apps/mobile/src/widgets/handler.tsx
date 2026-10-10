// 위젯 처리기: 추가·갱신·크기 변경 때 저장 데이터로 다시 그린다 (네트워크 없음)
import { todayISO } from '@hanjibung/core';
import type { WidgetInfo, WidgetRepresentation, WidgetTaskHandlerProps } from 'react-native-android-widget';

import { getSmallChoice, listRows, readWidgetCache, removeSmallChoice, smallRow, type WidgetCache } from './cache';
import { renderList, renderSmall } from './DdayWidgets';

export const SMALL = 'DdaySmall';
export const LIST = 'DdayList';

export async function renderWidgetFor(info: WidgetInfo, cache?: WidgetCache): Promise<WidgetRepresentation> {
  const data = cache ?? (await readWidgetCache());
  const today = todayISO();
  if (info.widgetName === SMALL) return renderSmall(smallRow(data, today, await getSmallChoice(info.widgetId)));
  return renderList(listRows(data, today), info);
}

export async function widgetTaskHandler({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps): Promise<void> {
  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      renderWidget(await renderWidgetFor(widgetInfo));
      break;
    case 'WIDGET_DELETED':
      if (widgetInfo.widgetName === SMALL) await removeSmallChoice(widgetInfo.widgetId);
      break;
    default:
      // OPEN_APP·OPEN_URI 누름은 라이브러리가 직접 처리한다
      break;
  }
}
