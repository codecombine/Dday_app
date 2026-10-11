// 일정·기념일 로컬 알림 (앱): 앞으로 60일치를 폰에 예약하고, 앱을 열 때·항목이 바뀔 때 다시 맞춘다 (명세서 12장)
// 알림을 누르면 data.itemId로 상세 화면을 여는 처리는 push.native.ts(공용 알림 처리기)가 맡는다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Item } from '@hanjibung/core';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { hashString, planReminders } from './reminders-plan';

const CHANNEL_ID = 'default';
const ID_PREFIX = 'hjb-rem-';
const HASH_KEY = 'hanjibung.reminders.hash';
const ASKED_KEY = 'hanjibung.reminders.asked';

let queue: Promise<void> = Promise.resolve();

/** 동시에 여러 번 불려도 차례로 처리한다 */
function serial(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task, task).catch(() => {});
  return queue;
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: '일정·기념일 알림',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

/** 알림을 켠 항목을 저장할 때 한 번만 권한을 묻는다 (앱을 열자마자 묻지 않는다) */
export async function askReminderPermission(): Promise<boolean> {
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return true;
    if (!cur.canAskAgain || (await AsyncStorage.getItem(ASKED_KEY))) return false;
    await AsyncStorage.setItem(ASKED_KEY, '1');
    await ensureChannel(); // 안드로이드 13+: 채널이 있어야 권한 창이 뜬다
    const res = await Notifications.requestPermissionsAsync();
    return res.granted;
  } catch {
    return false;
  }
}

async function scheduledReminderIds(): Promise<string[]> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.map((n) => n.identifier).filter((id) => id.startsWith(ID_PREFIX));
}

async function cancelAll(ids?: string[]): Promise<void> {
  const list = ids ?? (await scheduledReminderIds());
  await Promise.all(list.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
}

export function syncReminders(items: Item[], enabled: boolean): Promise<void> {
  return serial(async () => {
    const plan = enabled ? planReminders(items, new Date()) : [];
    const hash = hashString(JSON.stringify(plan.map((p) => [p.key, p.at, p.title, p.body])));
    const existing = await scheduledReminderIds();
    // 같은 계획이 이미 다 예약돼 있으면 건너뛴다 (울린 알림은 계획에서도 빠지므로 개수가 같아야 한다)
    if ((await AsyncStorage.getItem(HASH_KEY)) === hash && existing.length === plan.length) return;

    await cancelAll(existing);
    if (plan.length > 0) {
      // 권한이 없으면 예약하지 않고, 기록도 남기지 않아 권한이 생긴 뒤 다시 맞춘다
      if (!(await Notifications.getPermissionsAsync()).granted) {
        await AsyncStorage.removeItem(HASH_KEY);
        return;
      }
      await ensureChannel();
      for (const p of plan) {
        await Notifications.scheduleNotificationAsync({
          identifier: `${ID_PREFIX}${hashString(p.key)}`,
          content: {
            title: p.title,
            body: p.body,
            data: { type: 'reminder', itemId: p.itemId, url: `hanjibung://item/${p.itemId}` },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: CHANNEL_ID },
        });
      }
    }
    await AsyncStorage.setItem(HASH_KEY, hash);
  });
}

/** 로그아웃 때: 예약한 알림을 모두 지운다 */
export function clearReminders(): Promise<void> {
  return serial(async () => {
    await cancelAll();
    await AsyncStorage.removeItem(HASH_KEY);
  });
}
