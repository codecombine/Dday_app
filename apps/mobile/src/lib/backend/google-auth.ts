// 웹: 구글 로그인 팝업
import { GoogleAuthProvider, signInWithPopup, type Auth } from 'firebase/auth';

export async function googleSignIn(auth: Auth): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}
