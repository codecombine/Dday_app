#!/usr/bin/env node
// 예전 D-Day 웹앱(legacy/vite-web)의 `ddays` 문서를 한지붕 `items`(기념일)로 옮긴다.
//
//   node scripts/migrate-legacy-ddays.mjs <서비스계정.json>            # 백업 + 시험 실행 (쓰지 않음)
//   node scripts/migrate-legacy-ddays.mjs <서비스계정.json> --write    # 백업 + 실제로 옮김
//
// - 예전 앱과 한지붕은 같은 Firebase 프로젝트·로그인(이메일, Google)을 쓰므로 uid가 그대로 이어진다.
//   그래서 각 문서를 그 사람의 "나만" 공간(personal_<uid>)에 넣는다. 공간 문서는 처음 로그인할 때 생긴다.
// - 문서 ID는 legacy_<예전 문서 ID>로 고정하고 "없을 때만 만들기"로 쓰므로 여러 번 실행해도 된다.
// - `ddays`는 지우지 않는다. 백업은 ~/backup/hanjibung/ 에 남긴다 (레포 밖).
import { createSign } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const [saPath, ...flags] = process.argv.slice(2);
if (!saPath) {
  console.error('사용법: node scripts/migrate-legacy-ddays.mjs <서비스계정.json> [--write]');
  process.exit(1);
}
const WRITE = flags.includes('--write');
const sa = JSON.parse(readFileSync(saPath, 'utf8'));
const PROJECT = sa.project_id;
const DB = `projects/${PROJECT}/databases/(default)/documents`;
const API = `https://firestore.googleapis.com/v1/${DB}`;

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  });
  if (!res.ok) throw new Error(`토큰 발급 실패: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

const token = await accessToken();
async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${await res.text()}`);
  return res.json();
}

// Firestore REST 값 ↔ JS 값
function fromValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromValue);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, fromValue(x)]));
  return v;
}
function toValue(x) {
  if (x === null) return { nullValue: null };
  if (typeof x === 'string') return { stringValue: x };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (Number.isInteger(x)) return { integerValue: String(x) };
  if (typeof x === 'number') return { doubleValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(toValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, toValue(v)])) } };
}

// 1. 예전 문서 전부 읽기
const docs = [];
let pageToken;
do {
  const q = new URLSearchParams({ pageSize: '300', ...(pageToken ? { pageToken } : {}) });
  const r = await call('GET', `${API}/ddays?${q}`);
  docs.push(...(r.documents ?? []));
  pageToken = r.nextPageToken;
} while (pageToken);
const roots = (await call('POST', `${API}:listCollectionIds`, { pageSize: 100 })).collectionIds ?? [];

// 2. 백업 (원본 REST 응답 그대로)
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = join(homedir(), 'backup', 'hanjibung');
mkdirSync(backupDir, { recursive: true });
const backupFile = join(backupDir, `legacy-ddays-${stamp}.json`);
writeFileSync(backupFile, JSON.stringify({ project: PROJECT, exportedAt: new Date().toISOString(), documents: docs }, null, 2), { mode: 0o600 });

// 3. 변환
const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10); // 한국 날짜
const items = [];
const skipped = {};
const skip = (why) => (skipped[why] = (skipped[why] ?? 0) + 1);
for (const d of docs) {
  const id = d.name.split('/').pop();
  const f = Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, fromValue(v)]));
  const uid = typeof f.userId === 'string' ? f.userId : '';
  const title = typeof f.title === 'string' ? f.title.trim().slice(0, 60) : '';
  const date = typeof f.date === 'string' ? f.date : '';
  if (!uid) { skip('userId 없음'); continue; }
  if (!title) { skip('제목 없음'); continue; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { skip('날짜 형식 다름'); continue; }
  const created = Date.parse(f.createdAt ?? d.createTime) || Date.parse(d.createTime) || Date.now();
  items.push({
    id: `legacy_${id}`,
    uid,
    data: {
      kind: 'anniversary',
      title,
      memo: '',
      spaceIds: [`personal_${uid}`],
      ownerUid: uid,
      coEdit: false,
      participants: [],
      date,
      allDay: true,
      time: null,
      endDate: null,
      endTime: null,
      repeat: 'none',
      lunar: null,
      // 예전 앱은 지난 날을 "지난 기간"으로, 앞으로 올 날을 D-n으로 보여줬다
      mode: date < today ? 'since' : 'countdown',
      countFromOne: true,
      milestones: true,
      reminders: [{ daysBefore: 7, time: '09:00' }, { daysBefore: 0, time: '09:00' }],
      createdAt: created,
      updatedAt: created,
      updatedBy: uid,
    },
  });
}

const perUser = {};
for (const it of items) perUser[it.uid] = (perUser[it.uid] ?? 0) + 1;
console.log(`프로젝트: ${PROJECT}`);
console.log(`최상위 컬렉션: ${roots.join(', ') || '(없음)'}`);
console.log(`예전 문서: ${docs.length}개 → 옮길 것 ${items.length}개, 건너뜀 ${JSON.stringify(skipped)}`);
console.log(`사용자: ${Object.keys(perUser).length}명`);
for (const [uid, n] of Object.entries(perUser)) console.log(`  ${uid.slice(0, 6)}… ${n}개`);
console.log(`  (지난 날 ${items.filter((i) => i.data.mode === 'since').length}개는 "지난 날부터 세기", 나머지는 D-Day)`);
console.log(`백업: ${backupFile}`);

if (!WRITE) {
  console.log('\n시험 실행이라 쓰지 않았습니다. 실제로 옮기려면 --write 를 붙여 다시 실행하세요.');
  process.exit(0);
}

// 4. 쓰기: 없을 때만 만들기 (이미 옮긴 문서는 건너뜀)
let created = 0;
let existed = 0;
for (let i = 0; i < items.length; i += 400) {
  const chunk = items.slice(i, i + 400);
  const r = await call('POST', `${API}:batchWrite`, {
    writes: chunk.map((it) => ({
      update: { name: `${DB}/items/${it.id}`, fields: toValue(it.data).mapValue.fields },
      currentDocument: { exists: false },
    })),
  });
  r.status.forEach((s, j) => {
    if (!s.code) created++;
    else if (s.code === 6 || s.code === 9) existed++; // ALREADY_EXISTS, FAILED_PRECONDITION
    else throw new Error(`${chunk[j].id} 쓰기 실패: ${JSON.stringify(s)}`);
  });
}
console.log(`\n옮김: 새로 ${created}개, 이미 있던 것 ${existed}개`);
