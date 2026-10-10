// 안드로이드: AsyncStorage에 로그인 상태 유지
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FirebaseApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';

// getReactNativePersistence는 firebase/auth의 react-native 빌드에만 있어서 타입 정의에 없다
const { initializeAuth } = FirebaseAuth;
const getReactNativePersistence = (FirebaseAuth as unknown as {
  getReactNativePersistence: (storage: typeof AsyncStorage) => FirebaseAuth.Persistence;
}).getReactNativePersistence;

export function createAuth(app: FirebaseApp): FirebaseAuth.Auth {
  return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
}
