// 새 사진 자동으로 올리기 (명세서 8.3). 앱을 열 때와 백그라운드 작업에서 같은 함수를 부른다.
// 켠 시각 이후에 찍힌 사진만, 고른 폴더(기본: 카메라)에서, 사진만(영상 제외) 올린다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AutoUploadSettings, UserDoc } from '@hanjibung/core';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import type { Backend } from '@/lib/backend';

import { unmetCondition } from './conditions';
import { ensureLibraryPermission, findFolder, nextAssets, type AssetCursor } from './library';
import { uploadBatch } from './upload';

export const AUTO_UPLOAD_TASK = 'hanjibung-auto-upload';
const cursorKey = (uid: string) => `hanjibung.autoUpload.cursor.${uid}`;
const STATUS_KEY = 'hanjibung.autoUpload.status';
const LOCK_KEY = 'hanjibung.autoUpload.lock';
const PAGE = 10;
/** 한 번 실행에 쓰는 최대 시간 (안드로이드 백그라운드 작업은 10분 안에 끝나야 한다) */
const BUDGET_MS = 8 * 60_000;

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

export const autoUploadAvailable = true;

let running = false;

export async function getAutoUploadStatus(): Promise<AutoUploadStatus> {
  try {
    const raw = await AsyncStorage.getItem(STATUS_KEY);
    if (raw) return JSON.parse(raw) as AutoUploadStatus;
  } catch {
    // 무시
  }
  return { lastRunAt: null, uploaded: 0, message: null };
}

async function saveStatus(s: AutoUploadStatus) {
  await AsyncStorage.setItem(STATUS_KEY, JSON.stringify(s)).catch(() => {});
}

/** 자동 올리기를 켤 때: 지금부터 찍는 사진만 올리도록 시작점을 저장 */
export async function startAutoUploadFrom(uid: string, time = Date.now()): Promise<void> {
  const cursor: AssetCursor = { time, ids: [] };
  await AsyncStorage.setItem(cursorKey(uid), JSON.stringify(cursor));
}

/** 백그라운드 작업 등록/해제 (약 1시간마다, 시스템이 시점을 정한다) */
export async function setAutoUploadSchedule(enabled: boolean): Promise<void> {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(AUTO_UPLOAD_TASK);
    if (enabled && !registered) await BackgroundTask.registerTaskAsync(AUTO_UPLOAD_TASK, { minimumInterval: 60 });
    if (!enabled && registered) await BackgroundTask.unregisterTaskAsync(AUTO_UPLOAD_TASK);
  } catch (e) {
    console.warn('[auto-upload] 백그라운드 작업 등록 실패', e);
  }
}

async function takeLock(): Promise<boolean> {
  if (running) return false;
  const raw = await AsyncStorage.getItem(LOCK_KEY).catch(() => null);
  if (raw && Date.now() - Number(raw) < BUDGET_MS + 60_000) return false;
  running = true;
  await AsyncStorage.setItem(LOCK_KEY, String(Date.now())).catch(() => {});
  return true;
}

async function releaseLock() {
  running = false;
  await AsyncStorage.removeItem(LOCK_KEY).catch(() => {});
}

/** 새 사진을 찾아 올린다. 올린 장 수를 돌려준다 */
export async function runAutoUpload(backend: Backend, ctx: AutoUploadContext): Promise<number> {
  if (!ctx.auto.enabled || !ctx.uid) return 0;
  if (!(await takeLock())) return 0;
  const started = Date.now();
  let uploaded = 0;
  let message: string | null = null;
  try {
    message = await unmetCondition(ctx.auto);
    if (message) return 0;
    if (!(await ensureLibraryPermission(false))) {
      message = '사진 접근 권한이 필요해요';
      return 0;
    }
    const folder = await findFolder(ctx.auto.album);
    if (!folder) {
      message = `'${ctx.auto.album ?? '카메라'}' 폴더를 찾지 못했어요`;
      return 0;
    }
    const raw = await AsyncStorage.getItem(cursorKey(ctx.uid));
    if (!raw) {
      await startAutoUploadFrom(ctx.uid);
      return 0;
    }
    let cursor = JSON.parse(raw) as AssetCursor;
    const valid = ctx.auto.spaceIds.filter((s) => ctx.spaceIds.includes(s));
    const spaceIds = valid.length ? valid : [ctx.personalSpaceId];

    while (Date.now() - started < BUDGET_MS) {
      const page = await nextAssets({ folderId: folder.id, from: null, to: null }, cursor, PAGE);
      if (!page.assets.length) {
        if (page.cursor) cursor = page.cursor;
        break;
      }
      const res = await uploadBatch(backend, page.assets, { spaceIds });
      // 하나도 못 올리고 실패만 있으면 (네트워크 등) 다음에 다시 시도
      if (res.failed > 0 && res.uploaded === 0 && res.existing === 0) {
        message = '올리지 못한 사진이 있어 다음에 다시 시도해요';
        break;
      }
      uploaded += res.uploaded;
      cursor = page.cursor ?? cursor;
      await AsyncStorage.setItem(cursorKey(ctx.uid), JSON.stringify(cursor));
      const unmet = await unmetCondition(ctx.auto);
      if (unmet) {
        message = unmet;
        break;
      }
    }
    return uploaded;
  } catch (e) {
    message = e instanceof Error ? e.message : '자동 올리기에 실패했어요';
    return uploaded;
  } finally {
    await saveStatus({ lastRunAt: Date.now(), uploaded, message });
    await releaseLock();
  }
}

/** 화면 없이(백그라운드) 로그인 사용자와 설정을 한 번 읽는다 */
export function loadUserOnce(backend: Backend, timeoutMs = 15_000): Promise<UserDoc | null> {
  return new Promise((resolve) => {
    let done = false;
    let unsubUser: (() => void) | null = null;
    let unsubAuth: (() => void) | null = null;
    const finish = (u: UserDoc | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // 구독 콜백 안에서 바로 풀면 안 되는 구현이 있어 다음 틱에 정리
      setTimeout(() => {
        unsubUser?.();
        unsubAuth?.();
      }, 0);
      resolve(u);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    unsubAuth = backend.onAuth((user) => {
      if (!user) return; // 아직 복원 중일 수 있다 (시간 초과로 끝난다)
      if (unsubUser) return;
      unsubUser = backend.watchUser(user.uid, (doc) => {
        if (doc) finish(doc);
      });
    });
  });
}

/** 백그라운드 작업 본체 */
export async function runAutoUploadHeadless(backend: Backend): Promise<number> {
  const me = await loadUserOnce(backend);
  if (!me || !me.settings.autoUpload?.enabled) return 0;
  return runAutoUpload(backend, { uid: me.uid, personalSpaceId: me.personalSpaceId, spaceIds: me.spaceIds, auto: me.settings.autoUpload });
}
