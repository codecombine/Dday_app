// .ics 내보내기 (앱): 캐시 폴더에 파일을 쓰고 공유 창을 연다. 웹 구현은 ics.web.ts
import type { Item } from '@hanjibung/core';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { icsFileName, icsText } from '@/components/schedule/files';

export async function exportIcs(items: Item[], calendarName = '한지붕'): Promise<void> {
  if (items.length === 0) throw new Error('내보낼 항목이 없어요.');
  const file = new File(Paths.cache, icsFileName());
  file.create({ overwrite: true });
  file.write(icsText(items, calendarName));
  if (!(await Sharing.isAvailableAsync())) throw new Error('이 기기에서는 파일을 공유할 수 없어요.');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/calendar', dialogTitle: '캘린더 파일 보내기', UTI: 'public.calendar-event' });
}
