// .ics 내보내기 (웹): 보이는 항목을 파일로 내려받는다
import type { Item } from '@hanjibung/core';

import { downloadBlob, icsFileName, icsText } from '@/components/schedule/files';

export async function exportIcs(items: Item[], calendarName = '한지붕'): Promise<void> {
  if (items.length === 0) throw new Error('내보낼 항목이 없어요.');
  const blob = new Blob([icsText(items, calendarName)], { type: 'text/calendar;charset=utf-8' });
  downloadBlob(blob, icsFileName());
}
