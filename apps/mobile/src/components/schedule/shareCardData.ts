// 공유 카드에 들어갈 글자 (명세서 14장: 제목, D-n 또는 n일째, 날짜)
import { diffDays, elapsedYMD, formatElapsed, formatKoreanDate, itemStatus, type ISODate, type Item } from '@hanjibung/core';

import { REPEAT_LABEL, isSince, lunarLong } from './format';

export const CARD_W = 1080;
export const CARD_H = 1350;

/** 1080×1350 기준 크기 (앱 화면 카드와 웹 canvas가 같이 씀) */
export const CARD_LAYOUT = {
  pad: 96,
  brand: '한지붕',
  brandSize: 40,
  footer: '가족의 날을 함께 세요 · 한지붕',
  footerSize: 34,
  title: 68,
  titleLH: 88,
  big: 220,
  line1: 50,
  line2: 44,
  gap: 28,
  circle: { cx: 1020, cy: 120, r: 360 },
} as const;

export interface ShareCardData {
  title: string;
  big: string;
  line1: string;
  line2: string;
}

export function shareCardData(item: Item, today: ISODate): ShareCardData {
  const st = itemStatus(item, today);
  if (isSince(item)) {
    const started = diffDays(item.date, today) >= 0;
    return {
      title: item.title,
      big: st.headline,
      line1: `${formatKoreanDate(item.date, { year: true })}${started ? '부터' : ''}`,
      line2: started ? formatElapsed(elapsedYMD(item.date, today)) : '',
    };
  }
  const next = st.nextDate ?? item.date;
  return {
    title: item.title,
    big: st.headline,
    line1: formatKoreanDate(next, { year: true }),
    line2: item.lunar && item.repeat === 'yearly' ? `${lunarLong(item.lunar)} · 매년` : item.repeat !== 'none' ? REPEAT_LABEL[item.repeat] : '',
  };
}
