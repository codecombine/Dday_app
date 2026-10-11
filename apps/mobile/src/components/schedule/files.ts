// 파일 내보내기 도우미 (.ics 내용 만들기, 웹 내려받기)
import { buildIcs, todayISO, type Item } from '@hanjibung/core';

export function icsText(items: Item[], calendarName: string): string {
  return buildIcs(
    items.map((item) => ({ id: item.id, item })),
    todayISO(),
    calendarName,
  );
}

/** 파일 이름: 브라우저마다 한글 이름 처리가 달라 영문으로 만든다 ("hanjibung-card-2026-10-10.png") */
export function exportFileName(kind: string, ext: string): string {
  return `hanjibung${kind ? `-${kind}` : ''}-${todayISO()}.${ext}`;
}

export function icsFileName(): string {
  return exportFileName('', 'ics');
}

/** 웹 전용: Blob을 파일로 내려받는다 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
