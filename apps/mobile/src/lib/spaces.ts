// 화면에서 자주 쓰는 공간 관련 도우미
import type { Item, Member, Space } from '@hanjibung/core';

import type { ChipOption } from '@/components/ui';

export const ALL = 'all';

/** 걸러보기 칩: 전체 + 나만 + 공용 공간들 */
export function spaceChips(spaces: Space[]): ChipOption[] {
  return [{ id: ALL, label: '전체' }, ...spaces.map((s) => ({ id: s.id, label: s.kind === 'personal' ? '나만' : s.name, color: s.color }))];
}

export function inFilter<T extends { spaceIds: string[] }>(rows: T[], filter: string): T[] {
  return filter === ALL ? rows : rows.filter((r) => r.spaceIds.includes(filter));
}

export function spaceLabel(s: Space | undefined): string {
  if (!s) return '';
  return s.kind === 'personal' ? '나만' : s.name;
}

/** 항목·사진의 공유 범위를 꼬리표로 */
export function tagsFor(spaceIds: string[], spaceById: Record<string, Space>): { id: string; name: string; color: string }[] {
  return spaceIds
    .map((id) => spaceById[id])
    .filter((s): s is Space => !!s)
    .map((s) => ({ id: s.id, name: spaceLabel(s), color: s.color }));
}

/** "누구 일정" 표시 문자열 */
export function participantText(item: Pick<Item, 'participants'>): string {
  if (item.participants.length === 0) return '가족 모두';
  return item.participants.map((p) => p.displayName).join(', ');
}

/** 내 표시 이름 (공간마다 다를 수 있어 첫 번째 계정 구성원 이름) */
export function myName(members: Member[], uid: string, fallback: string): string {
  return members.find((m) => m.uid === uid)?.displayName ?? fallback;
}
