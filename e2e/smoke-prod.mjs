// 운영 점검 (읽기 전용, 로그인 없이). 배포 뒤에 한 번씩 돌린다: node smoke-prod.mjs
// 웹 주소·Worker 주소·Firebase 프로젝트를 바꿨으면 아래 상수를 고친다.
const WEB = 'https://hanjibung.pages.dev';
const API = 'https://hanjibung-api.1538iron.workers.dev';
const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/d-day-app/databases/(default)/documents';

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ ok: true, name, detail: detail ?? '' });
  } catch (e) {
    results.push({ ok: false, name, detail: e instanceof Error ? e.message : String(e) });
  }
}
function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}
const get = (url, init) => fetch(url, { redirect: 'manual', ...init });

// ── 웹 (Cloudflare Pages) ──
for (const path of ['/', '/login', '/invite/some-token-1234567890', '/auth/kakao']) {
  await check(`웹 ${path} 는 앱 화면(index.html)`, async () => {
    const r = await get(WEB + path);
    const body = await r.text();
    expect(r.status === 200, `HTTP ${r.status}`);
    expect(body.includes('/_expo/static/js/web/'), '앱 번들이 없음');
  });
}
await check('웹 번들에 운영 설정이 들어 있다 (데모 모드 아님)', async () => {
  const html = await (await get(WEB + '/')).text();
  const js = html.match(/\/_expo\/static\/js\/web\/[^"]+\.js/)?.[0];
  expect(js, '번들 주소를 못 찾음');
  const code = await (await get(WEB + js)).text();
  expect(code.includes(API.replace('https://', '')), 'Worker 주소가 번들에 없음');
});
await check('개인정보처리방침·약관이 채워져 있다', async () => {
  for (const p of ['/privacy', '/terms']) {
    const r = await fetch(WEB + p);
    const t = await r.text();
    expect(r.status === 200, `${p} HTTP ${r.status}`);
    expect(!/\[(운영자 이름|이메일|시행일 입력|웹 주소)\]/.test(t), `${p}에 빈칸이 남음`);
  }
});
await check('assetlinks.json (초대 링크를 앱으로 열기)', async () => {
  const r = await get(WEB + '/.well-known/assetlinks.json');
  const j = await r.json();
  expect(r.status === 200, `HTTP ${r.status}`);
  expect(j[0]?.target?.package_name === 'com.codecombine.hanjibung', '패키지 이름이 다름');
  return `지문 ${j[0].target.sha256_cert_fingerprints.length}개`;
});
await check('보안 헤더 (nosniff)', async () => {
  const r = await get(WEB + '/');
  expect(r.headers.get('x-content-type-options') === 'nosniff', '없음');
});

// ── API (Cloudflare Worker) ──
await check('API /health', async () => {
  const r = await get(API + '/health');
  const j = await r.json();
  expect(r.status === 200 && j.ok === true, `HTTP ${r.status}`);
});
await check('CORS: 웹 주소에서 오는 요청은 허용', async () => {
  const r = await get(API + '/me/bootstrap', {
    method: 'OPTIONS',
    headers: { Origin: WEB, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
  });
  expect(r.status === 204 || r.status === 200, `HTTP ${r.status}`);
  expect(r.headers.get('access-control-allow-origin') === WEB, `allow-origin ${r.headers.get('access-control-allow-origin')}`);
});
await check('CORS: 다른 사이트에서 오는 요청은 거부', async () => {
  const r = await get(API + '/me/bootstrap', {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
  });
  const allow = r.headers.get('access-control-allow-origin');
  expect(!allow || allow === WEB, `allow-origin ${allow}`);
});
for (const [method, path] of [
  ['POST', '/me/bootstrap'],
  ['POST', '/spaces'],
  ['POST', '/photos/prepare'],
  ['DELETE', '/me'],
  ['GET', '/calendar/google'],
]) {
  await check(`로그인 없이 ${method} ${path} 는 401`, async () => {
    const r = await get(API + path, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });
    expect(r.status === 401, `HTTP ${r.status}`);
  });
}
await check('없는 초대 링크는 404', async () => {
  const r = await get(API + '/invites/abcdefghijklmnop1234');
  expect(r.status === 404, `HTTP ${r.status}`);
});
await check('서명 없는 사진 주소는 거부', async () => {
  const r = await get(API + '/b/not-a-photo');
  expect(r.status >= 400 && r.status < 500, `HTTP ${r.status}`);
});
await check('카카오: 가짜 인가 코드는 401', async () => {
  const r = await get(API + '/auth/kakao', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WEB },
    body: JSON.stringify({ code: 'smoke-test-invalid-code', redirectUri: WEB + '/auth/kakao' }),
  });
  expect(r.status === 401, `HTTP ${r.status}`);
});
await check('카카오: 가짜 액세스 토큰은 401', async () => {
  const r = await get(API + '/auth/kakao', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WEB },
    body: JSON.stringify({ accessToken: 'smoke-test-invalid-token' }),
  });
  expect(r.status === 401, `HTTP ${r.status}`);
});

// ── Firestore 보안 규칙 (로그인 없이는 아무것도 못 읽는다) ──
for (const col of ['items', 'spaces', 'users', 'photos', 'ddays']) {
  await check(`Firestore ${col}: 로그인 없이 목록 조회 거부`, async () => {
    const r = await get(`${FIRESTORE}/${col}?pageSize=1`);
    expect(r.status === 403, `HTTP ${r.status}`);
  });
}

const bad = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '✓' : '✘'} ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
console.log(`\n${results.length - bad.length}/${results.length} 통과`);
process.exit(bad.length ? 1 : 0);
