// 공유 카드 내보내기 (웹): 같은 모양을 <canvas>에 그려 1080×1350 PNG로 내려받는다
import type { RefObject } from 'react';
import type { View } from 'react-native';

import { light } from '@/theme/colors';
import { fonts } from '@/theme';

import { downloadBlob, exportFileName } from './files';
import { CARD_H, CARD_W, CARD_LAYOUT as L, type ShareCardData } from './shareCardData';

export const SHARE_ACTION_LABEL = 'PNG로 저장';

const font = (weight: number, size: number, family: string) => `${weight} ${size}px ${family}, 'IBM Plex Sans KR', sans-serif`;

async function ensureFonts(data: ShareCardData): Promise<void> {
  const all = `${data.title}${data.big}${data.line1}${data.line2}${L.brand}${L.footer}`;
  const loads = [
    document.fonts.load(font(700, L.big, fonts.bold), all),
    document.fonts.load(font(600, L.title, fonts.semibold), all),
    document.fonts.load(font(500, L.line1, fonts.medium), all),
    document.fonts.load(font(400, L.line2, fonts.regular), all),
  ];
  // 글꼴을 못 받아도 기본 글꼴로 그린다
  await Promise.race([Promise.allSettled(loads), new Promise((r) => setTimeout(r, 2500))]);
}

/** 최대 줄 수 안에서 글자 단위로 줄을 나눈다 (넘치면 …) */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > maxW && cur) {
      lines.push(cur);
      cur = ch.trimStart();
      if (lines.length === maxLines) break;
    } else cur += ch;
  }
  if (lines.length < maxLines) lines.push(cur);
  else {
    let last = lines[maxLines - 1]!;
    while (last && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, family: string, maxW: number): number {
  let s = size;
  ctx.font = font(weight, s, family);
  while (s > 60 && ctx.measureText(text).width > maxW) {
    s -= 8;
    ctx.font = font(weight, s, family);
  }
  return s;
}

export async function exportShareCard(_ref: RefObject<View | null>, data: ShareCardData): Promise<void> {
  await ensureFonts(data);
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이 브라우저에서는 이미지를 만들 수 없어요.');
  const maxW = CARD_W - L.pad * 2;

  ctx.fillStyle = light.primary;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = light.primaryCardInner;
  ctx.beginPath();
  ctx.arc(L.circle.cx, L.circle.cy, L.circle.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = light.primaryCardMuted;
  ctx.font = font(600, L.brandSize, fonts.semibold);
  ctx.fillText(L.brand, L.pad, L.pad + L.brandSize);

  // 가운데 글자 묶음
  ctx.font = font(600, L.title, fonts.semibold);
  const titleLines = wrap(ctx, data.title, maxW, 2);
  const bigSize = fitFont(ctx, data.big, 700, L.big, fonts.bold, maxW);
  const blockH =
    titleLines.length * L.titleLH + L.gap + bigSize * 1.1 + L.gap + L.line1 * 1.3 + (data.line2 ? L.line2 * 1.5 : 0);
  let y = (CARD_H - blockH) / 2 + L.title;

  ctx.fillStyle = light.primaryCardText;
  ctx.font = font(600, L.title, fonts.semibold);
  for (const line of titleLines) {
    ctx.fillText(line, L.pad, y);
    y += L.titleLH;
  }
  y += L.gap + bigSize * 0.85;
  ctx.font = font(700, bigSize, fonts.bold);
  ctx.fillText(data.big, L.pad - 6, y);
  y += bigSize * 0.25 + L.gap + L.line1;
  ctx.fillStyle = light.primaryCardMuted;
  ctx.font = font(500, L.line1, fonts.medium);
  ctx.fillText(data.line1, L.pad, y);
  if (data.line2) {
    y += L.line2 * 1.5;
    ctx.font = font(400, L.line2, fonts.regular);
    ctx.fillText(data.line2, L.pad, y);
  }

  ctx.font = font(500, L.footerSize, fonts.medium);
  ctx.fillText(L.footer, L.pad, CARD_H - L.pad);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('이미지를 만들지 못했어요.');
  downloadBlob(blob, exportFileName('card', 'png'));
}
