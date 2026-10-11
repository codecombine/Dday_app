// 일정·기념일 로컬 알림 (웹): 웹은 알림을 보내지 않는다 (명세서 12장). 앱 구현은 reminders.native.ts
import type { Item } from '@hanjibung/core';

export async function syncReminders(_items: Item[], _enabled: boolean): Promise<void> {}

export async function clearReminders(): Promise<void> {}

export async function askReminderPermission(): Promise<boolean> {
  return false;
}
