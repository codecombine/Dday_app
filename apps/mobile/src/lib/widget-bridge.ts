// 위젯 갱신 요청 창구. 실제 구현은 widget-bridge.android.ts (일정 담당 화면 묶음에서 작성).
// 다른 모듈(푸시 수신, 항목 저장)은 이 함수만 부른다.
import type { Item, Space } from '@hanjibung/core';

export async function updateWidgets(_items: Item[], _spaces: Space[], _pinnedIds: string[]): Promise<void> {
  // 웹·iOS에는 위젯이 없다
}
