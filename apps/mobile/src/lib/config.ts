// 환경 설정. EXPO_PUBLIC_* 값은 빌드할 때 앱에 들어간다 (비밀값을 넣지 말 것).
// 값은 apps/mobile/.env (로컬) 또는 EAS 환경 변수로 설정한다. docs/SETUP.md 참고.

function env(name: string, fallback = ''): string {
  // Expo는 process.env.EXPO_PUBLIC_* 를 빌드 시점에 치환한다
  const value = (process.env as Record<string, string | undefined>)[name];
  return value && value.length > 0 ? value : fallback;
}

export const config = {
  apiUrl: env('EXPO_PUBLIC_API_URL', 'http://localhost:8787'),
  webOrigin: env('EXPO_PUBLIC_WEB_ORIGIN', 'https://hanjibung.pages.dev'),
  firebase: {
    apiKey: env('EXPO_PUBLIC_FIREBASE_API_KEY'),
    authDomain: env('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', 'd-day-app.firebaseapp.com'),
    projectId: env('EXPO_PUBLIC_FIREBASE_PROJECT_ID', 'd-day-app'),
    storageBucket: env('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET', 'd-day-app.appspot.com'),
    messagingSenderId: env('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', '39953405485'),
    appId: env('EXPO_PUBLIC_FIREBASE_APP_ID'),
  },
  /** Google OAuth 웹 클라이언트 ID (로그인·캘린더 연동 모두 사용) */
  googleWebClientId: env('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'),
  /** 카카오 네이티브 앱 키 (안드로이드) */
  kakaoNativeAppKey: env('EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY'),
  /** 카카오 REST API 키 (웹 로그인 인가 요청에 사용, 공개돼도 되는 값) */
  kakaoRestApiKey: env('EXPO_PUBLIC_KAKAO_REST_API_KEY'),
  /** 개발용: 설정이 비어 있으면 화면 확인용 데모 데이터로 동작 */
  demo: env('EXPO_PUBLIC_DEMO') === '1',
} as const;

export const isConfigured = (): boolean => Boolean(config.firebase.apiKey && config.firebase.appId);
