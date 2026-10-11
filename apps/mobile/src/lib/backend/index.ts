import { config, isConfigured } from '../config';
import { createDemoBackend } from './demo';
import { createFirebaseBackend } from './firebase';
import type { Backend } from './types';

export * from './types';

let instance: Backend | null = null;

/** 설정(EXPO_PUBLIC_FIREBASE_*)이 없거나 EXPO_PUBLIC_DEMO=1이면 데모 백엔드 */
export function getBackend(): Backend {
  if (!instance) instance = config.demo || !isConfigured() ? createDemoBackend() : createFirebaseBackend();
  return instance;
}
