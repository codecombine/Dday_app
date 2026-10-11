# 설정 작업 지시서 (Claude in Chrome이 있는 로컬 세션용)

> 이 문서는 사용자 컴퓨터에서 도는 Claude 세션(Claude 데스크톱 앱 또는 `claude remote-control`)이
> Claude in Chrome으로 `docs/SETUP.md`의 콘솔 설정을 대신 진행하기 위한 지시서다.
> 사용자는 이 레포 폴더에서 세션을 열고 "docs/HANDOFF-SETUP.md 대로 진행해줘"라고 말하면 된다.

## 지켜야 할 것
- **로그인·본인 인증·결제는 사용자가 직접 한다.** 로그인 화면, 2단계 인증, 결제 수단 입력, Play 개발자 등록비($25) 결제 화면이 나오면 멈추고 사용자에게 해달라고 한 뒤 기다린다.
- **비밀값은 화면에서 읽어 채팅에 옮기지 않는다.** 서비스 계정 JSON은 파일로 내려받기만 하고, 클라이언트 보안 비밀·카카오 Client Secret은 `scripts/setup-cloudflare.sh`가 물어볼 때 사용자가 직접 붙여넣게 한다.
- 공개 값(클라이언트 ID, 카카오 앱 키, Worker·Pages 주소, SHA 지문)은 아래 "모을 값" 표에 적고, 끝나면 설정 파일에 반영해 커밋한다.
- 되돌리기 어려운 선택(Firestore 위치, 패키지 이름, OAuth 게시 상태)은 실행 전에 사용자에게 한 번 확인한다.
- 브라우저에서 같은 동작이 2~3번 실패하면 멈추고 사용자에게 상황을 알린다.

## 진행 순서
각 단계의 자세한 클릭 경로는 `docs/SETUP.md`의 같은 번호를 따른다.

| 순서 | 사이트 | 할 일 (SETUP 번호) | 사용자 개입 |
|---|---|---|---|
| 1 | console.firebase.google.com/project/d-day-app | Authentication에서 이메일/비밀번호·Google 켜기 (1-3), Firestore가 없으면 `asia-northeast3`로 만들기 (1-6) | Google 로그인 |
| 2 | 같은 곳 → 프로젝트 설정 → 서비스 계정 | 새 비공개 키 생성 → JSON 내려받기 (1-4). 내용은 읽지 않는다 | 다운로드 확인 |
| 3 | console.cloud.google.com (project d-day-app) | Calendar API 사용 (2-1), OAuth 동의 화면: 외부·앱 이름 한지붕·범위 `calendar.app.created`·**프로덕션으로 푸시** (2-2), Web client의 클라이언트 ID 기록 (2-3) | 게시 상태 변경 확인 |
| 4 | developers.kakao.com | 앱 만들기(한지붕), 네이티브 앱 키·REST API 키 기록 (3-1), 카카오 로그인 ON·동의항목 닉네임 (3-3) | 카카오 로그인 |
| 5 | dash.cloudflare.com | 가입 확인, R2 사용 설정 (4-2) | 로그인, 결제 수단(요구 시) |
| 6 | 터미널 | `npm install` → `cd apps/worker && npx wrangler login` → `bash scripts/setup-cloudflare.sh <2에서 받은 JSON 경로>` (4-3). 스크립트가 묻는 비밀값은 사용자가 입력 | wrangler 로그인 허용, 비밀값 입력 |
| 7 | 터미널 + expo.dev | `cd apps/mobile && npx eas-cli@latest login && npx eas-cli@latest init && npx eas-cli@latest credentials -p android` (5-1, 5-2) → SHA-1·SHA-256 기록 | Expo 로그인 |
| 8 | Firebase 콘솔 | 안드로이드 앱 추가 `com.codecombine.hanjibung` + SHA-1 → `google-services.json` 내려받기 (1-2) | |
| 9 | 카카오 콘솔 | 플랫폼: Android(패키지·키 해시 = SHA-1 변환), Web(Pages 주소), Redirect URI `https://<Pages 주소>/auth/kakao` (3-2, 3-3) | |
| 10 | dash.cloudflare.com → Pages | Git 연결 `codecombine/Dday_app`, 빌드 명령·출력 폴더·환경 변수 (4-7) — **PR #1이 main에 병합된 뒤** | GitHub 연결 허용 |
| 11 | expo.dev → 프로젝트 → Environment variables | `EXPO_PUBLIC_*` 값과 `GOOGLE_SERVICES_JSON`(파일) 넣기 (5-3) | |
| 12 | 터미널 | `npx eas-cli@latest build -p android --profile preview` → APK 링크를 사용자에게 전달 (5-4) | 폰에 설치 |
| 13 | play.google.com/console | 개발자 등록, 앱 만들기, 내부 테스트 (6장, 문구는 `docs/PLAY_STORE.md`) | 등록비 결제, 본인 인증 |

## 모을 값 (공개 값만)
| 값 | 어디에 반영 |
|---|---|
| Google 웹 클라이언트 ID | `apps/worker/wrangler.toml` `GOOGLE_CLIENT_ID`, EAS·Pages `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` |
| 카카오 네이티브 앱 키 | EAS `EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY` |
| 카카오 REST API 키 | `wrangler.toml` `KAKAO_REST_API_KEY`, EAS·Pages `EXPO_PUBLIC_KAKAO_REST_API_KEY` |
| Worker 주소 | `wrangler.toml` `API_ORIGIN`(스크립트가 기록), EAS·Pages `EXPO_PUBLIC_API_URL` |
| Pages 주소 | `wrangler.toml` `WEB_ORIGIN`, EAS·Pages `EXPO_PUBLIC_WEB_ORIGIN`, Firebase 승인 도메인, 카카오 Web 플랫폼, Google 승인된 JavaScript 원본 |
| 서명 키 SHA-1 / SHA-256 | Firebase 안드로이드 앱, 카카오 키 해시, `apps/mobile/public/.well-known/assetlinks.json` |
| EAS 프로젝트 ID | `eas init`이 기록 |

`apps/mobile/.env.example`의 Firebase 웹 설정값은 이미 채워져 있다.

## 끝나면
- `wrangler.toml`, `assetlinks.json` 등 바뀐 파일을 커밋·푸시한다 (비밀값이 들어가지 않았는지 `git diff`로 확인).
- `docs/SETUP.md` 마지막의 확인 목록을 사용자와 함께 점검한다.
