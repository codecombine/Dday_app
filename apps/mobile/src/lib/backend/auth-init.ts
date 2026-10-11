// 웹: 브라우저 저장소에 로그인 상태 유지
import type { FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

export function createAuth(app: FirebaseApp): Auth {
  return getAuth(app);
}
