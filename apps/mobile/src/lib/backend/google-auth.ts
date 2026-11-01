// 웹: 구글 로그인 팝업
import { GoogleAuthProvider, signInWithPopup, type Auth } from 'firebase/auth';

export async function googleSignIn(auth: Auth): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}

/** 웹은 팝업마다 계정을 고르므로 따로 할 일이 없다 */
export async function googleSignOut(): Promise<void> {}
