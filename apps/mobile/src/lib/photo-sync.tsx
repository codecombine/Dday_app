// 화면 없이 도는 사진·푸시 동기화. 로그인한 영역((app)/_layout)에 한 번 올려 둔다. 아무것도 그리지 않는다.
// - 푸시 토큰 등록(권한이 이미 있을 때만)과 알림 처리기
// - 위젯 갱신용 최신 데이터 공급
// - 자동 올리기가 켜져 있으면 앱이 앞으로 올 때 새 사진을 올리고, 백그라운드 작업을 등록한다
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { runAutoUpload, setAutoUploadSchedule } from '@/lib/photos/auto-upload';
import { registerPushIfPermitted, setupPushListeners, setWidgetSnapshot } from '@/lib/push';
import { useSession } from '@/lib/session';

/** 앞으로 올 때마다 돌리지 않도록 최소 간격 */
const MIN_INTERVAL_MS = 10 * 60_000;

export function PhotoSync() {
  const { backend, status, uid, me, items, spaces, settings, personalSpaceId, mySpaceIds } = useSession();
  const ready = status === 'ready' && !!uid;
  const lastRun = useRef(0);

  // 푸시: 처리기는 한 번, 토큰은 로그인할 때마다
  useEffect(() => {
    if (!ready) return;
    const off = setupPushListeners(backend);
    void registerPushIfPermitted(backend);
    return off;
  }, [backend, ready]);

  // 위젯 갱신용 데이터
  useEffect(() => {
    setWidgetSnapshot(items, spaces, settings.pinnedItemIds);
  }, [items, spaces, settings.pinnedItemIds]);

  // 자동 올리기
  const auto = settings.autoUpload;
  const autoKey = JSON.stringify(auto);
  const hasUser = !!me;
  useEffect(() => {
    if (!ready || !hasUser) return;
    void setAutoUploadSchedule(auto.enabled);
    if (!auto.enabled) return;
    const kick = () => {
      if (Date.now() - lastRun.current < MIN_INTERVAL_MS) return;
      lastRun.current = Date.now();
      void runAutoUpload(backend, { uid, personalSpaceId, spaceIds: mySpaceIds, auto });
    };
    kick();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') kick();
    });
    return () => sub.remove();
    // 설정 내용(autoKey)이 바뀔 때만 다시 건다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, ready, hasUser, autoKey, uid, personalSpaceId, mySpaceIds.join(',')]);

  return null;
}
