// 공유 카드 내보내기 (앱): 화면의 카드를 1080×1350 PNG로 찍어 공유 창으로 보낸다. 웹은 shareCardCapture.web.ts
import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { CARD_H, CARD_W, type ShareCardData } from './shareCardData';

export const SHARE_ACTION_LABEL = '공유하기';

export async function exportShareCard(ref: RefObject<View | null>, _data: ShareCardData): Promise<void> {
  if (!ref.current) throw new Error('카드를 아직 그리지 못했어요.');
  const uri = await captureRef(ref, { format: 'png', quality: 1, width: CARD_W, height: CARD_H, result: 'tmpfile' });
  if (!(await Sharing.isAvailableAsync())) throw new Error('이 기기에서는 공유할 수 없어요.');
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '카드 보내기', UTI: 'public.png' });
}
