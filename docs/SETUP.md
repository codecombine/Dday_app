# 한지붕 설정 가이드 (직접 해주셔야 하는 일)

코드는 레포에 다 있고, 아래 설정은 **계정 권한이 필요해서** 직접 해주셔야 합니다.
순서대로 하면 되고, 각 단계에서 나온 값을 **어디에 넣는지**를 표시해 뒀습니다.

> 🔒 비밀값(서비스 계정 JSON, 클라이언트 보안 비밀 등)은 채팅에 붙여넣지 말고, 표시된 곳(Cloudflare 비밀값·EAS 환경 변수)에 직접 넣어주세요.

예상 소요: 처음 한 번 1~2시간 (계정 가입·결제 수단 등록 포함)

---

## 값 정리표 (다 끝나면 이렇게 채워져 있어야 합니다)

| 이름 | 어디서 얻나 | 넣는 곳 | 공개돼도 되나 |
|---|---|---|---|
| `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_APP_ID` | 1-1 | EAS 환경 변수, Cloudflare Pages 환경 변수 | 예 (웹 앱에 원래 들어감) |
| `EXPO_PUBLIC_API_URL` | 4-4 (Worker 주소) | EAS, Pages | 예 |
| `EXPO_PUBLIC_WEB_ORIGIN` | 4-7 (Pages 주소) | EAS, Pages | 예 |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | 2-3 | EAS, Pages, Worker 비밀값 `GOOGLE_CLIENT_ID` | 예 |
| `EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY` | 3-1 | EAS | 예 |
| `EXPO_PUBLIC_KAKAO_REST_API_KEY` | 3-1 | EAS, Pages, Worker 비밀값 `KAKAO_REST_API_KEY` | 예 |
| `GOOGLE_SERVICES_JSON` (파일) | 1-2 | EAS 파일 환경 변수 | 아니오 |
| `FIREBASE_SERVICE_ACCOUNT` | 1-4 | Worker 비밀값 (4-3 스크립트가 넣음) | **아니오** |
| `GOOGLE_CLIENT_SECRET` | 2-3 | Worker 비밀값 | **아니오** |
| `KAKAO_CLIENT_SECRET` (선택) | 3-3 | Worker 비밀값 | **아니오** |
| `TOKEN_ENC_KEY`, `URL_SIGNING_KEY`, `GOOGLE_WEBHOOK_SECRET` | 4-3 스크립트가 자동 생성 | Worker 비밀값 | **아니오** |

---

## 1. Firebase 콘솔 (기존 프로젝트 `d-day-app`)
https://console.firebase.google.com/project/d-day-app

1-1. **웹 앱 설정값**: 기존 웹 앱 값을 `apps/mobile/.env.example`에 이미 채워 두었습니다. 그대로 쓰면 되니 이 단계는 확인만 하세요.
1-2. **안드로이드 앱 추가**: 프로젝트 설정 → 일반 → 앱 추가 → Android
   - 패키지 이름 `com.codecombine.hanjibung`, 닉네임 `한지붕`
   - SHA-1·SHA-256 인증서 지문: **5-2를 먼저 하고** 거기서 나온 값을 넣기 (나중에 추가해도 됨)
   - `google-services.json` 다운로드 → EAS 파일 환경 변수 `GOOGLE_SERVICES_JSON` (5-3)
1-3. **로그인 방법**: Authentication → 로그인 방법 → `이메일/비밀번호`, `Google` 사용 설정
   - Authentication → 설정 → 승인된 도메인에 Pages 주소(예: `hanjibung.pages.dev`)와 자체 도메인 추가
1-4. **서비스 계정 키** (Worker가 Firestore·로그인·푸시를 다루는 데 사용): 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성 → JSON 파일
   - 이 파일 내용 전체를 Worker 비밀값 `FIREBASE_SERVICE_ACCOUNT`로 (4-5). **절대 레포에 올리지 마세요.**
1-5. **Firestore 규칙·색인 배포** (터미널, 레포 최상위에서):
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore --project d-day-app
   ```
1-6. Firestore가 아직 없다면 Firestore Database → 데이터베이스 만들기 (위치: `asia-northeast3` 서울 권장, 한 번 정하면 못 바꿈)

## 2. Google Cloud 콘솔 (같은 프로젝트)
https://console.cloud.google.com/?project=d-day-app

2-1. **Google Calendar API 사용 설정**: API 및 서비스 → 라이브러리 → "Google Calendar API" → 사용
2-2. **OAuth 동의 화면**: API 및 서비스 → OAuth 동의 화면 (Google 인증 플랫폼)
   - 사용자 유형 `외부`, 앱 이름 `한지붕`, 지원 이메일, 앱 홈페이지 `https://<웹 주소>`, 개인정보처리방침 `https://<웹 주소>/privacy.html`, 서비스 약관 `https://<웹 주소>/terms.html`
   - 데이터 액세스(범위)에 `https://www.googleapis.com/auth/calendar.app.created` 추가
   - 게시 상태: **프로덕션으로 푸시** (심사는 신청하지 않음 → 가족이 동의할 때 "확인되지 않은 앱" 경고가 뜨고, '고급 → 이동'으로 진행)
     - '테스트' 상태로 두면 7일마다 연동이 끊기니 꼭 프로덕션으로
2-3. **OAuth 클라이언트**: API 및 서비스 → 사용자 인증 정보
   - Firebase가 만든 `Web client (auto created by Google Service)`를 엽니다
   - 클라이언트 ID → `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` + Worker 비밀값 `GOOGLE_CLIENT_ID`
   - 클라이언트 보안 비밀 → Worker 비밀값 `GOOGLE_CLIENT_SECRET`
   - 승인된 JavaScript 원본에 `https://<웹 주소>` 추가 (웹에서 캘린더 연결 팝업용)
   - 안드로이드용 OAuth 클라이언트는 1-2에서 SHA-1을 넣으면 자동으로 생깁니다

## 3. Kakao Developers
https://developers.kakao.com/console/app

3-1. 애플리케이션 추가 (앱 이름 `한지붕`) → 앱 키에서 **네이티브 앱 키**, **REST API 키** → 표 참고
3-2. 플랫폼 등록
   - Android: 패키지명 `com.codecombine.hanjibung`, 키 해시 = 5-2의 SHA-1을 변환한 값:
     ```bash
     echo <SHA1 값(콜론 포함)> | tr -d ':' | xxd -r -p | openssl base64
     ```
   - Web: 사이트 도메인 `https://<웹 주소>`
3-3. 카카오 로그인 → 활성화 ON, Redirect URI에 `https://<웹 주소>/auth/kakao` 추가
   - 동의항목: 닉네임 (필수)
   - (선택) 보안 → Client Secret 사용 시 그 값을 Worker 비밀값 `KAKAO_CLIENT_SECRET`으로

## 4. Cloudflare (서버·사진 저장소·웹)
https://dash.cloudflare.com

4-1. 가입. (선택) 도메인 구매: Domain Registration → 연 1~2만 원대
4-2. R2 사용 설정: R2 → 구매/활성화 (결제 수단 등록을 요구할 수 있지만 10GB까지는 청구되지 않음)
4-3. **자동 설정 스크립트** (맥·리눅스 터미널, 윈도우는 Git Bash). 레포 최상위에서:
   ```bash
   npm install
   cd apps/worker && npx wrangler login && cd ../..        # 브라우저가 열리면 Cloudflare 로그인 → 허용
   bash scripts/setup-cloudflare.sh ~/Downloads/<1-4에서 받은 서비스계정>.json
   ```
   스크립트가 알아서 하는 일: D1 만들기와 `wrangler.toml`에 ID 기록, 테이블 만들기, R2 버킷 만들기,
   Worker 배포와 주소(`API_ORIGIN`) 기록, 무작위 비밀값 3개(`TOKEN_ENC_KEY`·`URL_SIGNING_KEY`·`GOOGLE_WEBHOOK_SECRET`) 생성·저장, 서비스 계정 저장.
   중간에 묻는 것: Google 클라이언트 ID(2-3), 카카오 REST API 키(3-1), 웹 주소, Google 클라이언트 보안 비밀(2-3), 카카오 Client Secret(선택).
   아직 없는 값은 엔터로 넘기고 나중에 **다시 실행**하면 됩니다 (이미 만든 것은 건너뜀).
4-4. 끝나면 출력되는 `EXPO_PUBLIC_API_URL` 값을 표의 해당 칸에 넣고, 바뀐 `apps/worker/wrangler.toml`을 커밋합니다 (비밀값은 안 들어 있음).
4-5. 스크립트 대신 손으로 하려면 `apps/worker/README.md`의 명령을 차례로 실행하면 됩니다.
4-6. (자체 도메인이 있으면) Worker → 설정 → 도메인에 `api.<도메인>` 연결
4-7. **웹(Pages)**: Workers & Pages → 만들기 → Pages → Git 연결 → `codecombine/Dday_app`
   - 프로덕션 브랜치: `main` (지금 작업은 `ccr-b9d508e4-ogbbbw` 브랜치에 있으니 PR로 합친 뒤)
   - 빌드 명령: `npm ci && npm run export:web -w @hanjibung/mobile`
   - 빌드 출력 디렉터리: `apps/mobile/dist`
   - 환경 변수: 표에서 "Pages"라고 적힌 `EXPO_PUBLIC_*` 값들 + `EXPO_OFFLINE=1`
   - 배포된 주소(예: `https://hanjibung.pages.dev`) → `EXPO_PUBLIC_WEB_ORIGIN`, Worker `WEB_ORIGIN`, Firebase 승인 도메인(1-3), Kakao Web 플랫폼(3-2), Google 원본(2-3)

## 5. Expo / EAS (안드로이드 앱 빌드)
5-1. https://expo.dev 가입 → 터미널에서 (`apps/mobile` 폴더):
   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest init          # 프로젝트 ID가 생김
   ```
5-2. 서명 키 만들기와 지문 확인:
   ```bash
   npx eas-cli@latest credentials -p android   # Keystore 생성 → SHA-1, SHA-256 표시
   ```
   - SHA-1 → Firebase 안드로이드 앱(1-2), Kakao 키 해시(3-2)
   - SHA-256 → 웹 `apps/mobile/public/.well-known/assetlinks.json` (초대 링크를 앱으로 바로 열기 위함, 아래 템플릿)
5-3. EAS 환경 변수: https://expo.dev → 프로젝트 → Environment variables
   - `production`, `preview` 환경에 표의 `EXPO_PUBLIC_*` 전부 (가시성 Plain text)
   - `GOOGLE_SERVICES_JSON`: 종류 **File**, 1-2의 파일 업로드 (가시성 Secret)
5-4. 빌드:
   ```bash
   npx eas-cli@latest build -p android --profile preview      # 바로 설치하는 APK (테스트용)
   npx eas-cli@latest build -p android --profile production   # Play 스토어용 AAB
   ```

`assetlinks.json` 템플릿 (`apps/mobile/public/.well-known/assetlinks.json`):
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": { "namespace": "android_app", "package_name": "com.codecombine.hanjibung",
              "sha256_cert_fingerprints": ["<5-2의 SHA-256>"] }
}]
```
> Play 스토어로 배포하면 Google이 앱 서명 키로 다시 서명합니다. Play Console → 설정 → 앱 서명의 **앱 서명 키 SHA-256**도 위 배열에 추가하고, 같은 키의 SHA-1을 Firebase·Kakao에도 추가해야 Play에서 받은 앱으로 로그인이 됩니다.

## 6. Google Play Console (가족에게 배포)
스토어 문구, 그래픽, 정책 양식 답변은 `docs/PLAY_STORE.md`에 정리해 두었습니다.
6-1. https://play.google.com/console 개발자 등록 (1회 $25, 본인 인증)
6-2. 앱 만들기: 이름 `한지붕`, 앱, 무료
6-3. 테스트 → **내부 테스트** → 테스터 목록에 가족 구글 계정 이메일 추가 → 새 버전 만들기 → 5-4의 AAB 업로드
6-4. 정책: 앱 콘텐츠의 개인정보처리방침 URL(`https://<웹 주소>/privacy.html`), 데이터 보안 양식(수집: 이메일·이름·사진·사용자 생성 콘텐츠, 전송 시 암호화, 삭제 요청 가능), 계정 삭제 URL(`https://<웹 주소>` → 나 → 계정 삭제)
6-5. 내부 테스트 링크를 가족에게 보내면 Play 스토어에서 설치·자동 업데이트됩니다 (심사·14일 테스트 요건 없음)

---

## 다 끝났는지 확인
- [ ] 웹 주소에서 카카오·구글·이메일로 로그인된다
- [ ] 공용 공간을 만들고 초대 링크로 가족이 들어온다
- [ ] 일정을 추가하면 가족 폰에 알림이 온다
- [ ] 사진을 올리면 다른 가족도 보인다
- [ ] 같은 사진을 두 번 올리면 "이미 있는 사진"으로 안내된다
- [ ] 구글 캘린더를 연결하면 "한지붕" 캘린더가 생기고 일정이 보인다
- [ ] 안드로이드 홈 화면에 위젯을 추가할 수 있다
