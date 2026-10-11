#!/usr/bin/env bash
# 한지붕 서버(Cloudflare Worker) 한 번에 설정하기.
# 먼저 `npx wrangler login` 으로 로그인한 뒤, 레포 최상위에서 실행한다:
#   bash scripts/setup-cloudflare.sh path/to/firebase-service-account.json
# 여러 번 실행해도 된다 (이미 만든 것은 건너뛴다). 맥·리눅스 터미널, 윈도우는 Git Bash에서 실행.
set -euo pipefail

SA_FILE="${1:-}"
cd "$(dirname "$0")/../apps/worker"
WR="npx --yes wrangler"
TOML="wrangler.toml"

say() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }
ask() { local prompt="$1" def="${2:-}" v; read -r -p "$prompt${def:+ [$def]}: " v; echo "${v:-$def}"; }
ask_secret() { local v; read -r -s -p "$1: " v; echo >&2; echo "$v"; }
get_var() { sed -n "s/^$1 = \"\(.*\)\"$/\1/p" "$TOML"; }
set_var() { # [vars] 안의 KEY = "값" 을 바꾼다
  local key="$1" val="$2"
  python3 - "$TOML" "$key" "$val" <<'PY'
import re, sys
path, key, val = sys.argv[1:]
s = open(path, encoding='utf-8').read()
s, n = re.subn(rf'^{key} = ".*"$', f'{key} = "{val}"', s, flags=re.M)
if n == 0: raise SystemExit(f'{key} not found in {path}')
open(path, 'w', encoding='utf-8').write(s)
PY
}

say "1/7 로그인 확인"
$WR whoami || { echo "먼저 'npx wrangler login' 을 실행해 주세요."; exit 1; }

say "2/7 D1 데이터베이스"
if grep -q 'REPLACE_WITH_D1_ID' "$TOML"; then
  ID=$($WR d1 list --json 2>/dev/null | python3 -c 'import json,sys; d=[x for x in json.load(sys.stdin) if x.get("name")=="hanjibung"]; print(d[0]["uuid"] if d else "")' || true)
  if [ -z "$ID" ]; then
    $WR d1 create hanjibung
    ID=$($WR d1 list --json | python3 -c 'import json,sys; print([x for x in json.load(sys.stdin) if x.get("name")=="hanjibung"][0]["uuid"])')
  fi
  sed -i.bak "s/REPLACE_WITH_D1_ID/$ID/" "$TOML" && rm -f "$TOML.bak"
  echo "database_id = $ID (wrangler.toml에 기록)"
else
  echo "이미 설정됨"
fi
$WR d1 migrations apply hanjibung --remote

say "3/7 R2 사진 저장소"
$WR r2 bucket create hanjibung-photos 2>&1 | grep -v "already exists" || true  # 이미 있으면 그대로 둔다

say "4/7 공개 설정값 (wrangler.toml [vars])"
set_var WEB_ORIGIN "$(ask '웹 주소 (Cloudflare Pages)' "$(get_var WEB_ORIGIN)")"

say "5/7 배포 (비밀값을 넣으려면 Worker가 먼저 있어야 함)"
OUT=$($WR deploy 2>&1 | tee /dev/stderr)
# 바인딩 표의 API_ORIGIN 값도 workers.dev 주소라서, 주소만 있는 줄(배포된 주소)만 고른다
URL=$(echo "$OUT" | grep -E '^[[:space:]]*https://[a-zA-Z0-9.-]+\.workers\.dev[[:space:]]*$' | head -1 | tr -d '[:space:]')
if [ -n "$URL" ] && ! grep -q "API_ORIGIN = \"$URL\"" "$TOML"; then
  set_var API_ORIGIN "$URL"
  $WR deploy >/dev/null
fi

say "6/7 비밀값 (넣는 즉시 적용)"
EXISTING=$($WR secret list --format json 2>/dev/null || echo '[]')
has() { echo "$EXISTING" | grep -q "\"$1\""; }
put() { printf '%s' "$2" | $WR secret put "$1" >/dev/null && echo "  $1 저장"; }
if [ -n "$SA_FILE" ]; then
  put FIREBASE_SERVICE_ACCOUNT "$(python3 -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1]))))' "$SA_FILE")"
elif ! has FIREBASE_SERVICE_ACCOUNT; then
  echo "  ⚠ FIREBASE_SERVICE_ACCOUNT 없음: 서비스 계정 JSON 경로를 인자로 주고 다시 실행하세요 (SETUP 1-4)"
fi
# 클라이언트 ID·REST API 키는 공개돼도 되는 값이지만 레포에 두지 않으려고 비밀값으로 넣는다
if ! has GOOGLE_CLIENT_ID; then
  v=$(ask 'Google OAuth 웹 클라이언트 ID (SETUP 2-3, 나중에 하려면 엔터)')
  if [ -n "$v" ]; then put GOOGLE_CLIENT_ID "$v"; fi
fi
if ! has KAKAO_REST_API_KEY; then
  v=$(ask '카카오 REST API 키 (SETUP 3-1, 나중에 하려면 엔터)')
  if [ -n "$v" ]; then put KAKAO_REST_API_KEY "$v"; fi
fi
if ! has GOOGLE_CLIENT_SECRET; then
  v=$(ask_secret 'Google 클라이언트 보안 비밀 (SETUP 2-3, 나중에 하려면 엔터)')
  if [ -n "$v" ]; then put GOOGLE_CLIENT_SECRET "$v"; fi
fi
if ! has KAKAO_CLIENT_SECRET; then
  v=$(ask_secret '카카오 Client Secret (새 앱은 기본으로 켜져 있어 필요, 끈 경우만 엔터)')
  if [ -n "$v" ]; then put KAKAO_CLIENT_SECRET "$v"; fi
fi
# 아래 셋은 무작위로 만든다. 이미 있으면 바꾸지 않는다 (바꾸면 저장된 구글 연동이 풀린다)
if ! has TOKEN_ENC_KEY; then put TOKEN_ENC_KEY "$(openssl rand -base64 32)"; fi
if ! has URL_SIGNING_KEY; then put URL_SIGNING_KEY "$(openssl rand -hex 32)"; fi
if ! has GOOGLE_WEBHOOK_SECRET; then put GOOGLE_WEBHOOK_SECRET "$(openssl rand -hex 32)"; fi

say "7/7 확인"
if [ -n "$URL" ]; then curl -fsS "$URL/health" && echo; fi
cat <<EOF

✅ 서버 설정 완료
  앱·웹 환경 변수에 넣을 값:
    EXPO_PUBLIC_API_URL=$URL
  wrangler.toml 이 바뀌었으니 커밋해 주세요 (비밀값은 들어 있지 않습니다).
EOF
