// 푸시 알림 (명세서 12장). 웹은 알림을 보내지 않으므로 web 기기는 건너뛴다.
import type { NotifySettings, SilentPushData, UserDoc } from '@hanjibung/core';

import type { Deps } from '../deps';
import type { PushMessage } from '../google/fcm';
import { P } from '../repo/docstore';
import { MINUTE } from '../util/time';
import { getUser, subjectParticle, uniq } from './common';

interface DeviceDoc {
  fcmToken: string;
  platform: 'android' | 'ios' | 'web';
  updatedAt: number;
}

/**
 * 사용자들의 기기로 보낸다. setting을 주면 그 알림을 끈 사람은 뺀다.
 * UNREGISTERED 토큰의 기기 문서는 지운다.
 */
export async function pushToUsers(
  deps: Deps,
  uids: readonly string[],
  msg: PushMessage | ((uid: string) => PushMessage | null),
  setting?: keyof NotifySettings,
): Promise<number> {
  let targets = uniq(uids);
  if (!targets.length) return 0;
  if (setting) {
    const users = await deps.docs.getMany<UserDoc>(targets.map(P.user));
    targets = targets.filter((uid) => users.get(P.user(uid))?.settings?.notify?.[setting] !== false);
  }
  let sent = 0;
  for (const uid of targets) {
    const m = typeof msg === 'function' ? msg(uid) : msg;
    if (!m) continue;
    const devices = await deps.docs.query<DeviceDoc>(P.devices(uid));
    for (const d of devices) {
      if (!d.data.fcmToken || d.data.platform === 'web') continue;
      const r = await deps.push.send(d.data.fcmToken, m);
      if (r === 'ok') sent++;
      if (r === 'unregistered') await deps.docs.commit([{ op: 'delete', path: d.path }]);
    }
  }
  return sent;
}

export function silent(data: SilentPushData): PushMessage {
  return { data: { ...data } };
}

// ── 묶음 사진 알림 ("아빠가 사진 12장을 올렸어요") ───────────

/** 마지막 올리기 뒤 이만큼 조용하면 묶어서 보낸다 */
export const PHOTO_NOTICE_QUIET_MS = 20_000;

export async function flushPhotoNotices(deps: Deps, uploaderUid: string, quietMs = PHOTO_NOTICE_QUIET_MS): Promise<number> {
  const notices = await deps.index.listNotices(uploaderUid);
  if (!notices.length) return 0;
  const last = Math.max(...notices.map((n) => n.createdAt));
  if (deps.now() - last < quietMs) return 0; // 아직 올리는 중
  await deps.index.deleteNotices(notices.map((n) => n.photoId));

  const uploader = await getUser(deps, uploaderUid);
  const name = uploader?.displayName || '가족';
  const spaceIds = uniq(notices.flatMap((n) => n.spaceIds));
  const spaces = await deps.docs.getMany<{ memberUids?: string[]; kind?: string }>(spaceIds.map(P.space));
  // 받는 사람마다 볼 수 있는 사진 수를 센다
  const counts = new Map<string, number>();
  for (const n of notices) {
    const viewers = new Set<string>();
    for (const s of n.spaceIds) for (const u of spaces.get(P.space(s))?.memberUids ?? []) viewers.add(u);
    viewers.delete(uploaderUid);
    for (const u of viewers) counts.set(u, (counts.get(u) ?? 0) + 1);
  }
  return pushToUsers(
    deps,
    [...counts.keys()],
    (uid) => ({
      notification: { title: '새 사진', body: `${subjectParticle(name)} 사진 ${counts.get(uid)}장을 올렸어요` },
      data: { type: 'photos-changed', uploaderUid, tag: `photos-${uploaderUid}` },
    }),
    'newPhoto',
  );
}

/** 정기 작업: 오래 남은 대기열을 보낸다 (isolate가 끝나 debounce가 못 보낸 경우) */
export async function flushStalePhotoNotices(deps: Deps): Promise<void> {
  const uids = await deps.index.listNoticeUidsBefore(deps.now() - 2 * MINUTE);
  for (const uid of uids) await flushPhotoNotices(deps, uid, 0);
}
