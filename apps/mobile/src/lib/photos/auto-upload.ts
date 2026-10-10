// 웹에는 자동 올리기가 없다. 네이티브 구현은 auto-upload.native.ts
import type { AutoUploadSettings, UserDoc } from '@hanjibung/core';

import type { Backend } from '@/lib/backend';

export const AUTO_UPLOAD_TASK = 'hanjibung-auto-upload';

export interface AutoUploadStatus {
  lastRunAt: number | null;
  uploaded: number;
  message: string | null;
}

export interface AutoUploadContext {
  uid: string;
  personalSpaceId: string;
  spaceIds: string[];
  auto: AutoUploadSettings;
}

export const autoUploadAvailable = false;

export async function getAutoUploadStatus(): Promise<AutoUploadStatus> {
  return { lastRunAt: null, uploaded: 0, message: null };
}

export async function startAutoUploadFrom(_uid: string, _time = Date.now()): Promise<void> {}

export async function setAutoUploadSchedule(_enabled: boolean): Promise<void> {}

export async function runAutoUpload(_backend: Backend, _ctx: AutoUploadContext): Promise<number> {
  return 0;
}

export function loadUserOnce(_backend: Backend, _timeoutMs = 15_000): Promise<UserDoc | null> {
  return Promise.resolve(null);
}

export async function runAutoUploadHeadless(_backend: Backend): Promise<number> {
  return 0;
}
