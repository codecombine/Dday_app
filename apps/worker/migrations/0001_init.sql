-- 한지붕 Worker 전용 데이터 (명세서 18.2)
-- 타임스탬프는 모두 epoch millis(INTEGER), 불리언은 0/1.

-- 초대 링크: 7일 동안 여러 번 쓸 수 있다
CREATE TABLE invites (
  token            TEXT PRIMARY KEY,
  space_id         TEXT NOT NULL,
  created_by       TEXT NOT NULL,
  target_member_id TEXT,
  expires_at       INTEGER NOT NULL,
  revoked          INTEGER NOT NULL DEFAULT 0,
  uses             INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL
);
CREATE INDEX idx_invites_space ON invites (space_id);
CREATE INDEX idx_invites_expires ON invites (expires_at);

-- 사진 지문 색인. pHash를 8비트씩 8조각(b0~b7)으로 나눠 한 조각이라도 같으면 중복 후보로 본다.
-- space_ids는 사진 문서의 공유 범위 사본(JSON 배열), 검색은 photo_space로 한다.
CREATE TABLE photo_fp (
  photo_id      TEXT PRIMARY KEY,
  owner_uid     TEXT NOT NULL,
  space_ids     TEXT NOT NULL DEFAULT '[]',
  sha256        TEXT NOT NULL,
  phash         TEXT NOT NULL,
  b0            TEXT NOT NULL,
  b1            TEXT NOT NULL,
  b2            TEXT NOT NULL,
  b3            TEXT NOT NULL,
  b4            TEXT NOT NULL,
  b5            TEXT NOT NULL,
  b6            TEXT NOT NULL,
  b7            TEXT NOT NULL,
  width         INTEGER NOT NULL,
  height        INTEGER NOT NULL,
  bytes         INTEGER NOT NULL,
  has_exif      INTEGER NOT NULL DEFAULT 0,
  taken_at      INTEGER,
  source        TEXT NOT NULL DEFAULT 'unknown',
  mime          TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'uploading', -- uploading | active | trashed
  has_original  INTEGER NOT NULL DEFAULT 0,
  has_preview   INTEGER NOT NULL DEFAULT 0,
  has_thumb     INTEGER NOT NULL DEFAULT 0,
  trashed_at    INTEGER,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_fp_sha ON photo_fp (sha256);
CREATE INDEX idx_fp_b0 ON photo_fp (b0);
CREATE INDEX idx_fp_b1 ON photo_fp (b1);
CREATE INDEX idx_fp_b2 ON photo_fp (b2);
CREATE INDEX idx_fp_b3 ON photo_fp (b3);
CREATE INDEX idx_fp_b4 ON photo_fp (b4);
CREATE INDEX idx_fp_b5 ON photo_fp (b5);
CREATE INDEX idx_fp_b6 ON photo_fp (b6);
CREATE INDEX idx_fp_b7 ON photo_fp (b7);
CREATE INDEX idx_fp_owner ON photo_fp (owner_uid, status);
CREATE INDEX idx_fp_status ON photo_fp (status, trashed_at);

-- 사진 ↔ 공간 (공간 단위 중복 검사·권한 확인용)
CREATE TABLE photo_space (
  photo_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  PRIMARY KEY (photo_id, space_id)
) WITHOUT ROWID;
CREATE INDEX idx_photo_space_space ON photo_space (space_id, photo_id);

-- 묶음 사진 알림 대기열 ("아빠가 사진 12장을 올렸어요")
CREATE TABLE photo_notices (
  photo_id   TEXT PRIMARY KEY,
  uid        TEXT NOT NULL,
  space_ids  TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_notices_uid ON photo_notices (uid, created_at);

-- 구글 캘린더 연결 (갱신 토큰은 AES-GCM 암호문)
CREATE TABLE google_accounts (
  uid                 TEXT PRIMARY KEY,
  email               TEXT,
  refresh_token_enc   TEXT NOT NULL,
  calendar_id         TEXT,
  mirror_space_ids    TEXT NOT NULL DEFAULT '[]', -- 빈 배열 = 전체
  channel_id          TEXT,
  channel_resource_id TEXT,
  channel_expires_at  INTEGER,
  sync_token          TEXT,
  full_sync_pending   INTEGER NOT NULL DEFAULT 0,
  last_full_sync_at   INTEGER,
  updated_at          INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_ga_channel ON google_accounts (channel_id);
CREATE INDEX idx_ga_channel_exp ON google_accounts (channel_expires_at);

-- 항목 ↔ 구글 일정 매핑. occurrence_key는 core calendarEntries의 key ('base', 'Y:2027', 'M:100일' …)
CREATE TABLE calendar_events (
  uid             TEXT NOT NULL,
  item_id         TEXT NOT NULL,
  occurrence_key  TEXT NOT NULL,
  google_event_id TEXT NOT NULL,
  item_updated_at INTEGER NOT NULL,
  PRIMARY KEY (uid, item_id, occurrence_key)
) WITHOUT ROWID;
CREATE INDEX idx_ce_item ON calendar_events (item_id);
CREATE INDEX idx_ce_google ON calendar_events (uid, google_event_id);

-- 정기 작업 기준 시각 등
CREATE TABLE sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
