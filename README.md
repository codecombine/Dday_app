# 한지붕

가족끼리 일정·기념일·사진을 한곳에서 함께 보는 앱. 안드로이드 앱과 웹을 코드 하나로 만든다.

- 기능 명세: [`docs/SPEC.md`](docs/SPEC.md)
- 직접 해야 하는 설정(계정·키·배포): [`docs/SETUP.md`](docs/SETUP.md)
- 화면 시안: https://claude.ai/artifact/W7hFY2YrgCESxMEeD1R2x9

## 구조

| 경로 | 내용 |
|---|---|
| `apps/mobile` | Expo(React Native) 앱 — 안드로이드 + 웹 |
| `apps/worker` | Cloudflare Worker API — 카카오 로그인, 초대, 사진 저장(R2), 중복 정리, 구글 캘린더 동기화, 푸시 |
| `packages/core` | 앱과 서버가 함께 쓰는 로직 — 날짜·음력·기념일, 공휴일, 권한, 사진 지문·중복 판정, 캘린더 변환, API 타입 |
| `packages/firestore-rules` | Firestore 보안 규칙 테스트 (에뮬레이터) |
| `e2e` | 웹 E2E(데모 모드, Playwright)와 운영 점검 스크립트. 앱 의존성과 섞지 않으려고 워크스페이스 밖에 둔다 |
| `firebase/` | Firestore 보안 규칙·색인 |
| `legacy/vite-web` | 예전 D-Day 웹 앱 (참고용) |

## 개발

```bash
npm install                     # 레포 최상위에서 한 번
npm run web                     # 웹으로 앱 실행 (설정값이 없으면 데모 데이터로 동작)
npm test                        # core·worker 단위 테스트
npm run typecheck               # 전체 타입 검사
npm run test:rules -w @hanjibung/firestore-rules   # 보안 규칙 테스트 (Java 필요)
cd e2e && npm install && npm run build && npm test  # 웹 E2E (데모 모드, 설치된 Chrome 사용)
node e2e/smoke-prod.mjs         # 운영 점검 (읽기 전용, 배포 뒤에)
```

- 앱 설정값은 `apps/mobile/.env`에 `EXPO_PUBLIC_*`로 넣는다 (목록은 `docs/SETUP.md`의 값 정리표).
  값이 없거나 `EXPO_PUBLIC_DEMO=1`이면 메모리 안의 예시 가족 데이터로 동작한다.
- 안드로이드 기기 테스트는 개발 빌드가 필요하다: `cd apps/mobile && npx eas-cli build -p android --profile development`
- 서버 로컬 실행: `cd apps/worker && cp .dev.vars.example .dev.vars && npm run dev`
