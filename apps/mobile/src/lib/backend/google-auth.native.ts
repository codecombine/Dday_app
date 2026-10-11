// 안드로이드: 네이티브 구글 로그인 → Firebase 자격 증명
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential, type Auth } from 'firebase/auth';

import { config } from '../config';
import { ApiError } from './types';

let configured = false;

function ensureConfigured() {
  if (!configured) {
    GoogleSignin.configure({ webClientId: config.googleWebClientId });
    configured = true;
  }
}

export async function googleSignIn(auth: Auth): Promise<void> {
  ensureConfigured();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const res = await GoogleSignin.signIn();
  if (!isSuccessResponse(res)) throw new ApiError(0, 'cancelled', '');
  const idToken = res.data.idToken;
  if (!idToken) throw new ApiError(0, 'no-id-token', '구글 로그인 정보를 받지 못했어요.');
  await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
}

/** 앱 로그아웃 때 구글 계정 선택도 지운다 (안 지우면 다음 로그인 때 같은 계정으로 바로 들어가 계정을 바꿀 수 없다) */
export async function googleSignOut(): Promise<void> {
  ensureConfigured();
  await GoogleSignin.signOut();
}
