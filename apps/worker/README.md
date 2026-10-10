# 한지붕 API (Cloudflare Worker)

가족 앱 "한지붕"의 서버. 명세서(`docs/SPEC.md`) 17~20장의 Worker 부분을 구현한다.

- **Hono** 라우터, TypeScript strict
- **D1** (`DB`): 초대, 사진 지문 색인, 구글 연결(암호화 토큰), 캘린더 매핑, 정기 작업 상태
- **R2** (`PHOTOS`): 사진 원본·미리보기·썸네일 — 저장소 계층(`src/storage/blob-store.ts`) 뒤에 숨김
- **Firestore / Firebase Auth / FCM / Google Calendar**: Admin SDK 없이 REST로 호출 (`src/google/`)
- 요청·응답 타입은 `@hanjibung/core`의 `api.ts`를 그대로 쓴다

## 폴더

```
src/
  index.ts            진입점 (fetch + scheduled)
  app.ts              Hono 조립: CORS, 의존성 주입, 인증, 오류 응답
  deps.ts             외부 의존성 묶음 (테스트에서 가짜로 바꾼다)
  auth/               Firebase ID 토큰 검증, 맞춤 토큰 발급, 카카오
  google/             서비스 계정 토큰, Firestore REST, Identity Toolkit, FCM, Calendar
  repo/               DocStore(Firestore) · IndexStore(D1) 인터페이스와 구현
  storage/            BlobStore (R2 구현, NAS용 S3 구현 자리)
  services/           업무 로직 (구성원, 초대, 사진, 중복 정리, 캘린더, 알림, 계정 삭제, 정기 작업)
  routes/             HTTP 라우트
migrations/           D1 스키마
test/                 vitest (메모리 Firestore + Node 내장 SQLite로 만든 D1 가짜)
```

## 바인딩·환경 변수 (`wrangler.toml`)

| 이름 | 종류 | 설명 |
|---|---|---|
| `DB` | D1 | `hanjibung` 데이터베이스. `database_id`를 실제 값으로 바꿔야 한다 |
| `PHOTOS` | R2 | `hanjibung-photos` 버킷 (공개하지 않는다) |
| `FIREBASE_PROJECT_ID` | var | `d-day-app` |
| `WEB_ORIGIN` | var | 웹 앱 주소. 초대 링크와 CORS에 쓴다 |
| `API_ORIGIN` | var | 이 Worker의 공개 주소. 사진 서명 주소·구글 변경 알림 주소에 쓴다 |
| `GOOGLE_CLIENT_ID` | var | 구글 OAuth 웹 클라이언트 ID |
| `KAKAO_REST_API_KEY` | var | 카카오 REST API 키 |
| `BLOB_BACKEND` | var | 사진 저장소 종류. 지금은 `r2`만 |
| `DEDUPE_*` | var | 중복 판정 기준값 (사본 6, 비슷함 10, 해상도 1.2배) |
| `CALENDAR_SYNC_BUDGET` | var | 한 번에 보내는 구글 캘린더 호출 수 상한 (남은 것은 정기 작업이 이어서) |

크론: `*/30 * * * *` (30분마다).

## 비밀값

레포에 넣지 않는다. 운영은 `npx wrangler secret put <이름>`, 로컬은 `.dev.vars`(`.dev.vars.example` 복사).

| 이름 | 필수 | 설명 |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | ✅ | Firebase 서비스 계정 키 JSON 전체 (한 줄). Firestore·Auth·FCM 호출과 카카오 맞춤 토큰 서명에 쓴다 |
| `GOOGLE_CLIENT_SECRET` | ✅ | 구글 OAuth 웹 클라이언트 비밀값 (캘린더 연결) |
| `KAKAO_CLIENT_SECRET` | | 카카오 Client Secret을 켰을 때만 |
| `TOKEN_ENC_KEY` | ✅ | 구글 갱신 토큰 AES-GCM 키. `openssl rand -base64 32` |
| `URL_SIGNING_KEY` | ✅ | 사진 서명 주소 HMAC 키. `openssl rand -hex 32` |
| `GOOGLE_WEBHOOK_SECRET` | ✅ | 구글 변경 알림 채널 토큰 HMAC 키. `openssl rand -hex 32` |

비밀값이 없으면 그 기능을 부를 때 `500 server_misconfigured`가 난다 (나머지 기능은 동작).

서비스 계정에 필요한 권한: Firestore 읽기·쓰기, Firebase Authentication 관리, FCM 발송
(Firebase 콘솔에서 만든 `firebase-adminsdk` 계정이면 충분하다).

## 로컬 개발

```bash
# 레포 루트에서 한 번
npm install

cd apps/worker
cp .dev.vars.example .dev.vars        # 값 채우기
npm run db:migrate:local              # 로컬 D1에 스키마 적용
npm run dev                           # wrangler dev → http://localhost:8787
curl http://localhost:8787/health

# 정기 작업 직접 실행
npx wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=*/30+*+*+*+*"
```

로컬에서도 Firestore·Auth·FCM은 실제 Firebase 프로젝트를 쓴다 (`FIREBASE_SERVICE_ACCOUNT`).
웹 앱(Expo web)은 `http://localhost:8081`, `http://localhost:19006`에서 CORS가 열려 있다.

검사:

```bash
npm run typecheck -w @hanjibung/worker
npm test -w @hanjibung/worker
npx wrangler deploy --dry-run --outdir /tmp/worker-dryrun   # 번들 확인 (계정 불필요)
```

## D1 마이그레이션

```bash
npx wrangler d1 create hanjibung                 # 처음 한 번 → database_id를 wrangler.toml에
npm run db:migrate:local                         # 로컬
npm run db:migrate:remote                        # 운영
npx wrangler d1 migrations create hanjibung <이름>  # 스키마를 바꿀 때 새 파일 추가
```

## 배포

```bash
npx wrangler r2 bucket create hanjibung-photos   # 처음 한 번
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT < service-account.json
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put TOKEN_ENC_KEY
npx wrangler secret put URL_SIGNING_KEY
npx wrangler secret put GOOGLE_WEBHOOK_SECRET
npm run db:migrate:remote
npm run deploy
```

배포 후 `API_ORIGIN`을 실제 주소(`https://hanjibung-api.<계정>.workers.dev` 또는 `api.<도메인>`)로 바꾸고 다시 배포한다.
사진 서명 주소와 구글 변경 알림이 이 주소로 만들어진다.

**요금제**: 중복 "다시 검사"(사진이 많은 공간), 구글 캘린더 첫 동기화, 계정 삭제는 CPU·하위 요청을 많이 쓴다.
Workers Free(요청당 CPU 10ms·하위 요청 50개)로는 부족할 수 있어 **Workers Paid**를 권한다.
Free로 운영한다면 `CALENDAR_SYNC_BUDGET`을 30 정도로 낮춘다.

## API 요약

모든 요청은 `Authorization: Bearer <Firebase ID 토큰>` (표시한 것 제외). 오류는 `{ error, message }` (message는 한국어).

| 메서드·경로 | 설명 |
|---|---|
| `GET /health` (토큰 불필요) | 상태 확인 |
| `POST /auth/kakao` (토큰 불필요) | `{accessToken}` 또는 `{code, redirectUri}` → `{customToken, uid, displayName}` |
| `POST /me/bootstrap` | 사용자 문서·개인 공간(`personal_<uid>`) 생성, 클레임 갱신 → `claimsChanged` |
| `DELETE /me` | 계정 삭제 (`photoChoices`: 'ask' 규칙 공간마다 keep/remove) |
| `POST /devices` · `DELETE /devices/:deviceId` | 푸시 토큰 등록·해제 (로그아웃 때 해제) |
| `POST /spaces` | 공용 공간 만들기 |
| `POST /spaces/:id/invites` · `DELETE /invites/:token` | 초대 링크 (관리자) |
| `GET /invites/:token` (토큰 불필요) | 초대 미리보기 |
| `POST /invites/:token/accept` | 초대 수락 (처음이면 시작하기까지) |
| `POST /spaces/:id/leave` | 나가기 (`photoChoice`) |
| `DELETE /spaces/:id/members/:memberId` · `POST .../role` | 내보내기·관리자 지정 |
| `POST /photos/prepare` | 같은 파일 확인, 사진 ID 발급 |
| `PUT /photos/:id/blob/:variant` | 파일 올리기 (`Content-Length` 필수, 원본 50MB·미리보기 5MB·썸네일 1MB) |
| `POST /photos/:id/commit` | 올리기 완료 → 중복 후보 갱신, 묶음 알림 |
| `PATCH /photos/:id` | 공유 범위·앨범 바꾸기 (올린 사람). 클라이언트는 `photos/*`를 직접 쓰지 않는다 |
| `POST /photos/:id/add` | 같은 파일이 이미 있을 때 기존 사진에 공간·앨범 더하기 (남의 사진이면 주인 확인 요청) |
| `POST /photos/urls` | 서명 주소 묶음 (최대 200장) |
| `GET /b/:id/:variant?exp&sig[&dl=1]` (서명으로 인증) | 사진 파일 |
| `POST /photos/:id/trash` · `/restore` | 휴지통 (`{spaceId}`를 주면 그 공간에서만 빼기) |
| `POST /spaces/:id/dedupe/scan` | 중복 다시 검사 (관리자) |
| `POST /dedupe/:groupId/apply` · `/dismiss` | 정리·무시 (관리자) |
| `POST /merge-requests/:id/approve` · `/reject` | 합치기 확인 (원본 주인) |
| `POST /calendar/google/connect` · `GET /calendar/google` · `PUT /calendar/google/settings` · `DELETE /calendar/google?deleteCalendar=1` | 구글 캘린더 |
| `POST /calendar/google/webhook` (채널 토큰으로 인증) | 구글 변경 알림 |
| `POST /items/:id/changed` | 항목 변경 통지 (`{created}`) → 캘린더 반영·가족 알림·위젯 무음 푸시 |

## 동작 메모

- **권한 확인**: 사진 주소 발급처럼 가벼운 확인은 토큰 클레임(`spaces`)으로, 구성원 변경·공유 범위 검사처럼
  민감한 확인은 `users/{uid}.spaceIds`·`spaces/{id}.adminUids`를 다시 읽어서 한다 (클레임이 막 바뀐 직후일 수 있다).
- **클레임 갱신**: 구성원이 바뀌면 Worker가 Firestore(`memberUids`·`adminUids`·`members`·`users.spaceIds`)와 맞춤 클레임을
  함께 바꾸고, 응답에 `claimsChanged: true`를 넣는다 → 앱은 `getIdToken(true)`. 내보내진 사람에게는 무음 푸시
  `{type:'items-changed', reason:'membership'}`를 보낸다.
- **사진 서명 주소**: 만료는 1시간 뒤를 15분 단위로 올림(60~75분). 같은 15분 안에는 주소가 같아서 이미지 캐시가 맞는다.
- **묶음 사진 알림**: `commit`마다 대기열(D1 `photo_notices`)에 넣고, 마지막 사진 뒤 20초 조용하면 한 번에 보낸다
  ("엄마가 사진 12장을 올렸어요"). 놓친 것은 정기 작업이 보낸다. 받는 사람의 `settings.notify.newPhoto`를 따른다.
- **푸시 데이터**: 모든 푸시 `data`에 `toUid`(받는 사람)를 넣는다. 기기의 로그인 계정이 바뀌었으면 앱이 무시하면 된다.
  안드로이드 알림 채널 ID는 `family`.
- **중복 정리**: 올라올 때마다 같은 공간에서 SHA-256 또는 pHash 조각(8비트×8)이 같은 사진만 후보로 보고,
  연결된 묶음을 다시 계산한다. 겹치는 열린 묶음의 ID를 다시 쓰고, 무시·정리·보류된 묶음의 부분집합은 다시 열지 않는다.
  관리자 알림은 공간마다 6시간에 한 번.
- **합치기 확인**: `mergeRequests/{id}`에는 core 타입에 더해 `removePhotoIds`(승인 대기 중인 사본)를 저장한다.
  `POST /photos/:id/add`에서 생긴 요청은 `groupId: ''`.
- **구글 캘린더**: `calendar.app.created` 범위만 쓴다. 앱 → 구글은 `calendarEntries`의 키별로 넣고·고치고·지운다.
  구글 → 앱은 반복 없는 단일 일정(`base`)의 제목·날짜·시각만 반영하고, 수정 권한이 없거나 반복·펼친 일정이면 앱 내용으로
  되돌린다. 구글에서 지운 일정은 그 사람 캘린더에서만 빠지고 다시 넣지 않는다(매핑에 지움 표시).
  앱이 보낸 변경의 알림(메아리)은 내용 비교로 거른다. 펼친 일정(음력 10년치·기념일 1년치)은 한 달에 한 번 전체 동기화로 갱신.
- **정기 작업**: 30분마다 알림 채널 갱신(만료 24시간 전), 바뀐 항목 보정(`updatedAt` 기준, 5분 겹침), 밀린 전체 동기화,
  남은 사진 알림. 하루 한 번(한국 날짜 기준) 휴지통 30일 지난 사진·7일 넘게 멈춘 올리기 삭제, 만료 30일 지난 초대 삭제,
  지워진 항목의 구글 일정 정리.

## Firestore 색인

모든 쿼리는 단일 필드 조건(또는 단일 필드 + 정렬)이라 자동 색인으로 충분하다:
`items.ownerUid ==`, `items.spaceIds array-contains(-any)`, `items.updatedAt > … order by updatedAt`,
`dedupeGroups.photoIds array-contains-any`, `dedupeGroups.spaceId ==`, `albums.ownerUid ==`, `albums.coverPhotoId ==`,
`albums.spaceIds array-contains`, `photos.albumIds array-contains-any`, `mergeRequests.ownerUid|requestedBy ==`,
`spaces/{id}/members.uid ==`.

## 저장소를 NAS로 옮길 때 (명세서 17.2)

1. `BlobStore`를 구현한 `S3BlobStore`(S3 호환 API + Cloudflare Tunnel)를 `src/storage/`에 추가한다.
2. `createBlobStore`에 `case 's3'`를 넣고 필요한 설정(엔드포인트·키)을 비밀값으로 받는다.
3. `BLOB_BACKEND`를 바꾼다. Firestore·D1에는 사진 ID만 있으므로 데이터 이전은 파일 복사뿐이다.
   (B안: 원본만 NAS → 변형별로 저장소를 고르는 작은 라우팅 BlobStore를 두면 된다.)
