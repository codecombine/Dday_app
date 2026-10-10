// 항목이 바뀌거나, 날짜가 넘어가거나, 앱으로 돌아오면 로컬 알림과 위젯 저장 데이터를 다시 맞춘다.
// 화면에는 아무것도 그리지 않는다. SessionProvider 안(루트 _layout의 Navigator)에 한 번만 둔다.
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useToday } from '@/components/schedule/data';

import { clearReminders, syncReminders } from './reminders';
import { useSession } from './session';
import { updateWidgets } from './widget-bridge';

const DEBOUNCE_MS = 800;

export function ScheduleSync() {
  const { status, items, spaces, settings } = useSession();
  const today = useToday();
  const notifyOn = settings.notify.anniversary;
  const pinned = settings.pinnedItemIds;
  // 앱으로 돌아올 때마다 다시 맞춘다 (설정에서 알림 권한을 켠 경우 등). 바뀐 게 없으면 금방 끝난다
  const [resumed, setResumed] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setResumed((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (status === 'signedOut') {
      // 로그아웃하면 이 폰에 남은 알림과 위젯 내용을 지운다
      clearReminders().catch(() => {});
      updateWidgets([], [], []).catch(() => {});
      return;
    }
    // 공간 목록이 오기 전(구독 시작 직후)에는 빈 목록으로 덮어쓰지 않는다
    if (status !== 'ready' || spaces.length === 0) return;
    const timer = setTimeout(() => {
      syncReminders(items, notifyOn).catch(() => {});
      updateWidgets(items, spaces, pinned).catch(() => {});
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [status, items, spaces, notifyOn, pinned, today, resumed]);

  return null;
}
