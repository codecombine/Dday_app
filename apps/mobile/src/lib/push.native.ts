// 서버 푸시(FCM) 등록과 수신 처리 (명세서 12장)
// - 권한은 앱을 열자마자 묻지 않고, 의미 있는 행동(첫 사진 올리기·공간 만들기 등) 뒤에 한 번만 묻는다
// - 무음 푸시 {type:'items-changed'} → 위젯 갱신
// - 알림을 누르면 해당 화면으로 이동 (일정 로컬 알림 {type:'reminder', itemId}도 여기서 처리)
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Item, RegisterDeviceRequest, Space } from '@hanjibung/core';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { Platform } from 'react-native';

import type { Backend } from '@/lib/backend';
import { updateWidgets } from '@/lib/widget-bridge';

import { normalizePushData, routeForPush, type PushData } from './push-routes';

export const PUSH_TASK = 'hanjibung-push';
export const pushAvailable = true;

const ASKED_KEY = 'hanjibung.pushAsked';
const DEVICE_KEY = 'hanjibung.deviceId';
const TOKEN_KEY = 'hanjibung.pushToken';

// ── 위젯 갱신에 쓸 최신 데이터 (PhotoSync가 세션에서 채운다) ──
let snapshot: { items: Item[]; spaces: Space[]; pinnedIds: string[] } | null = null;

export function setWidgetSnapshot(items: Item[], spaces: Space[], pinnedIds: string[]): void {
  snapshot = { items, spaces, pinnedIds };
}

async function refreshWidgets() {
  if (!snapshot) return; // 화면 없이 깨어난 경우: 위젯은 앱을 열 때 갱신된다
  try {
    await updateWidgets(snapshot.items, snapshot.spaces, snapshot.pinnedIds);
  } catch (e) {
    console.warn('[push] 위젯 갱신 실패', e);
  }
}

// ── 기기 등록 ──

async function deviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_KEY);
  if (id) return id;
  try {
    const androidId = Platform.OS === 'android' ? Application.getAndroidId() : null;
    id = androidId ? `android-${androidId}` : Crypto.randomUUID();
  } catch {
    id = Crypto.randomUUID();
  }
  await AsyncStorage.setItem(DEVICE_KEY, id);
  return id;
}

async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  // 서버가 보내는 가족 소식은 'family' 채널 (Worker fcm.ts)
  await Notifications.setNotificationChannelAsync('family', {
    name: '가족 소식',
    description: '가족이 올린 일정·사진, 중복 정리 요청',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

async function sendToken(backend: Backend, token: string) {
  const body: RegisterDeviceRequest = { deviceId: await deviceId(), fcmToken: token, platform: Platform.OS === 'ios' ? 'ios' : 'android' };
  await backend.api('POST', '/devices', body);
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

/** 권한이 이미 있으면 토큰을 서버에 등록한다 (묻지 않는다) */
export async function registerPushIfPermitted(backend: Backend): Promise<boolean> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return false;
    await ensureChannels();
    const token = await Notifications.getDevicePushTokenAsync();
    await sendToken(backend, String(token.data));
    return true;
  } catch (e) {
    console.warn('[push] 토큰 등록 실패', e);
    return false;
  }
}

/** 의미 있는 행동 뒤에 한 번만 알림 권한을 묻는다 */
export async function askPushPermissionOnce(backend: Backend): Promise<boolean> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.granted) return registerPushIfPermitted(backend);
    if ((await AsyncStorage.getItem(ASKED_KEY)) || !perm.canAskAgain) return false;
    await AsyncStorage.setItem(ASKED_KEY, '1');
    await ensureChannels(); // 안드로이드 13+: 채널이 있어야 권한 창이 뜬다
    const res = await Notifications.requestPermissionsAsync();
    if (!res.granted) return false;
    return registerPushIfPermitted(backend);
  } catch {
    return false;
  }
}

/** 로그아웃 전에: 이 기기로 다른 계정 알림이 오지 않도록 서버에서 기기를 지운다 */
export async function unregisterPush(backend: Backend): Promise<void> {
  try {
    const id = await AsyncStorage.getItem(DEVICE_KEY);
    if (id) await backend.api('DELETE', `/devices/${encodeURIComponent(id)}`);
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // 실패해도 로그아웃은 계속 (서버가 만료된 토큰을 정리한다)
  }
}

// ── 수신 처리 ──

function dataOf(n: Notifications.Notification): PushData {
  const content = n.request.content.data ?? {};
  const trigger = n.request.trigger as { remoteMessage?: { data?: Record<string, string> } } | null;
  return normalizePushData({ ...(trigger?.remoteMessage?.data ?? {}), ...content });
}

/** 무음 푸시 처리 (앱이 켜져 있을 때와 백그라운드 작업 모두) */
export async function handlePushData(data: PushData): Promise<void> {
  if (data.type === 'items-changed') await refreshWidgets();
}

/** 백그라운드 알림 작업 본체 (background/register.native.ts에서 등록) */
export async function handleBackgroundPush(payload: unknown): Promise<void> {
  const p = payload as { data?: unknown } | null;
  await handlePushData(normalizePushData(p?.data ?? p));
}

function openFor(data: PushData) {
  const path = routeForPush(data);
  if (path) router.push(path as Href);
}

/** 앱이 켜져 있는 동안의 알림 처리기. 해제 함수를 돌려준다 */
export function setupPushListeners(backend: Backend): () => void {
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const c = n.request.content;
      const silent = !c.title && !c.body;
      return { shouldShowBanner: !silent, shouldShowList: !silent, shouldPlaySound: !silent, shouldSetBadge: false };
    },
  });
  const subs = [
    Notifications.addNotificationReceivedListener((n) => {
      void handlePushData(dataOf(n));
    }),
    Notifications.addNotificationResponseReceivedListener((r) => openFor(dataOf(r.notification))),
    Notifications.addPushTokenListener((t) => {
      void sendToken(backend, String(t.data)).catch(() => {});
    }),
  ];
  // 앱이 꺼진 상태에서 알림을 눌러 연 경우
  Notifications.getLastNotificationResponseAsync()
    .then((r) => {
      if (r) {
        openFor(dataOf(r.notification));
        void Notifications.clearLastNotificationResponseAsync();
      }
    })
    .catch(() => {});
  return () => subs.forEach((s) => s.remove());
}
