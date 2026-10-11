// 항목 저장·삭제 (Firestore 직접 쓰기 + Worker에 변경 통지 → 구글 캘린더·가족 알림)
import type { Item } from '@hanjibung/core';

import type { Backend } from './backend';

export async function saveItem(backend: Backend, item: Item, isNew: boolean, uid: string): Promise<void> {
  const now = Date.now();
  const next: Item = { ...item, updatedAt: now, updatedBy: uid, createdAt: isNew ? now : item.createdAt };
  await backend.saveItem(next, isNew);
  notifyChanged(backend, next.id, isNew);
}

export async function deleteItem(backend: Backend, id: string): Promise<void> {
  await backend.deleteItem(id);
  notifyChanged(backend, id, false);
}

/** 실패해도 저장은 끝난 것이므로 조용히 넘어간다 (서버 정기 작업이 보정) */
function notifyChanged(backend: Backend, id: string, created: boolean) {
  backend.api('POST', `/items/${id}/changed`, { created }).catch(() => {});
}

export function emptyItem(id: string, uid: string, date: string, spaceIds: string[], kind: Item['kind'] = 'event'): Item {
  return {
    id,
    kind,
    title: '',
    memo: '',
    spaceIds,
    ownerUid: uid,
    coEdit: false,
    participants: [],
    date,
    allDay: true,
    time: null,
    endDate: null,
    endTime: null,
    repeat: 'none',
    lunar: null,
    mode: 'countdown',
    countFromOne: true,
    milestones: kind === 'anniversary',
    reminders: kind === 'anniversary' ? [{ daysBefore: 7, time: '09:00' }, { daysBefore: 0, time: '09:00' }] : [{ daysBefore: 1, time: '20:00' }],
    createdAt: 0,
    updatedAt: 0,
    updatedBy: uid,
  };
}
