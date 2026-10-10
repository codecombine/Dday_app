// 정기 작업 (30분마다): 알림 채널 갱신, 놓친 항목 변경 보정, 밀린 전체 동기화, 사진 알림,
// 하루 한 번: 휴지통 비우기(30일), 멈춘 올리기 정리, 지난 초대 삭제, 남은 캘린더 매핑 정리
import type { Item } from '@hanjibung/core';

import type { Deps } from '../deps';
import { P } from '../repo/docstore';
import { DAY, MINUTE, seoulToday } from '../util/time';
import { fullSync, propagateItem, renewChannels } from './calendar-sync';
import { forgetPhotos } from './dedupe';
import { flushStalePhotoNotices } from './notify';
import { hardDeletePhoto } from './photo-store';

const RECONCILE_KEY = 'items_reconciled_at';
const DAILY_KEY = 'daily_run_date';
const RECONCILE_LIMIT = 300;

async function step(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error(`정기 작업 실패: ${name}`, e);
  }
}

/** 마지막 실행 뒤 바뀐 항목을 다시 반영한다 (가족 알림 없이). 기기 시계 차이를 생각해 5분 겹쳐 본다 */
export async function reconcileItems(deps: Deps): Promise<number> {
  const now = deps.now();
  const last = Number((await deps.index.getState(RECONCILE_KEY)) ?? now - 60 * MINUTE);
  const accounts = await deps.index.listGoogleAccounts();
  if (!accounts.length) {
    await deps.index.setState(RECONCILE_KEY, String(now));
    return 0;
  }
  const rows = await deps.docs.query<Item>('items', {
    where: [{ field: 'updatedAt', op: 'GREATER_THAN', value: last - 5 * MINUTE }],
    orderBy: [{ field: 'updatedAt' }],
    limit: RECONCILE_LIMIT,
  });
  for (const r of rows) await propagateItem(deps, r.id);
  const mark = rows.length === RECONCILE_LIMIT ? rows[rows.length - 1]!.data.updatedAt : now;
  await deps.index.setState(RECONCILE_KEY, String(Math.max(last, mark)));
  return rows.length;
}

export async function continueFullSyncs(deps: Deps): Promise<void> {
  for (const acc of await deps.index.listGoogleAccounts()) {
    if (acc.fullSyncPending) await fullSync(deps, acc.uid);
  }
}

export async function purgeTrash(deps: Deps): Promise<number> {
  const now = deps.now();
  const trashed = await deps.index.listTrashedBefore(now - 30 * DAY, 200);
  const stale = await deps.index.listStaleUploads(now - 7 * DAY, 200);
  const ids = [...trashed, ...stale].map((r) => r.photoId);
  await forgetPhotos(deps, ids);
  for (const id of ids) await hardDeletePhoto(deps, id);
  return ids.length;
}

/** 지워진 항목의 구글 일정이 남아 있으면 지운다 */
async function cleanupOrphanLinks(deps: Deps): Promise<void> {
  let after = '';
  for (let page = 0; page < 5; page++) {
    const ids = await deps.index.listLinkedItemIds(after, 200);
    if (!ids.length) return;
    const found = await deps.docs.getMany(ids.map(P.item));
    for (const id of ids) if (!found.has(P.item(id))) await propagateItem(deps, id);
    after = ids[ids.length - 1]!;
  }
}

export async function runDaily(deps: Deps): Promise<boolean> {
  const today = seoulToday(deps.now());
  if ((await deps.index.getState(DAILY_KEY)) === today) return false;
  await deps.index.setState(DAILY_KEY, today);
  await step('purgeTrash', () => purgeTrash(deps));
  // 만료된 초대는 30일 동안 "만료됨"으로 보여 준 뒤 지운다
  await step('invites', () => deps.index.deleteInvitesExpiredBefore(deps.now() - 30 * DAY));
  await step('orphanLinks', () => cleanupOrphanLinks(deps));
  // 펼친 일정(음력 10년치·기념일 1년치)이 밀리지 않게 한 달에 한 번 전체 동기화
  await step('monthlyResync', async () => {
    for (const acc of await deps.index.listGoogleAccounts()) {
      if (!acc.lastFullSyncAt || acc.lastFullSyncAt < deps.now() - 30 * DAY) {
        await deps.index.patchGoogleAccount(acc.uid, { fullSyncPending: true });
      }
    }
  });
  return true;
}

export async function runScheduled(deps: Deps): Promise<void> {
  await step('renewChannels', () => renewChannels(deps));
  await step('reconcileItems', () => reconcileItems(deps));
  await step('fullSyncs', () => continueFullSyncs(deps));
  await step('photoNotices', () => flushStalePhotoNotices(deps));
  await step('daily', () => runDaily(deps));
}
