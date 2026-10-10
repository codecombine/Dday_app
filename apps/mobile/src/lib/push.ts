// 웹은 푸시 알림을 받지 않는다 (명세서 12장). 네이티브 구현은 push.native.ts
import type { Item, Space } from '@hanjibung/core';

import type { Backend } from '@/lib/backend';

import type { PushData } from './push-routes';

export const PUSH_TASK = 'hanjibung-push';
export const pushAvailable = false;

export function setWidgetSnapshot(_items: Item[], _spaces: Space[], _pinnedIds: string[]): void {}

export async function registerPushIfPermitted(_backend: Backend): Promise<boolean> {
  return false;
}

export async function askPushPermissionOnce(_backend: Backend): Promise<boolean> {
  return false;
}

export async function unregisterPush(_backend: Backend): Promise<void> {}

export async function handlePushData(_data: PushData): Promise<void> {}

export async function handleBackgroundPush(_payload: unknown): Promise<void> {}

export function setupPushListeners(_backend: Backend): () => void {
  return () => {};
}
