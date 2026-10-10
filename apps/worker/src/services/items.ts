// 항목 변경 통지 (POST /items/:id/changed): 구글 캘린더 반영 + 가족 알림 + 위젯 갱신 무음 푸시
import { canView } from '@hanjibung/core';

import type { AuthUser } from '../auth/firebase-auth';
import type { Deps } from '../deps';
import { forbidden } from '../errors';
import { itemViewers, propagateItem } from './calendar-sync';
import { getItem, getUser, subjectParticle } from './common';
import { pushToUsers, silent } from './notify';

export async function itemChanged(deps: Deps, user: AuthUser, itemId: string, created: boolean): Promise<void> {
  const item = await getItem(deps, itemId);
  if (item && item.ownerUid !== user.uid && !canView(item, user.spaces)) {
    // 토큰 클레임이 오래됐을 수 있으니 사용자 문서로 다시 확인
    const fresh = await getUser(deps, user.uid);
    if (!fresh || !canView(item, fresh.spaceIds)) throw forbidden('이 항목을 볼 수 없어요');
  }
  deps.defer(
    (async () => {
      // 항목이 없으면(삭제) 매핑된 구글 일정만 지운다
      await propagateItem(deps, itemId);
      if (!item) return;
      const viewers = await itemViewers(deps, item);
      if (created) {
        const editor = await getUser(deps, user.uid);
        const name = editor?.displayName || user.name || '가족';
        const what = item.kind === 'anniversary' ? '기념일' : '일정';
        await pushToUsers(
          deps,
          viewers.filter((u) => u !== user.uid),
          {
            notification: { title: `새 ${what}`, body: `${subjectParticle(name)} ${what}을 추가했어요: ${item.title}` },
            data: { type: 'items-changed', itemId, tag: `item-${itemId}` },
          },
          'familyEvent',
        );
      }
      await pushToUsers(deps, viewers, silent({ type: 'items-changed', itemId }));
    })(),
  );
}
