#!/bin/sh
# Supabase 프로젝트 준비 → 스키마 적용 → .env.local / .env.vercel 작성.
#
#   ./scripts/setup-supabase.sh                      # 프로젝트 생성까지 시도
#   PROJECT_REF=abcdefgh ./scripts/setup-supabase.sh # 이미 만든 프로젝트에 붙이기
#
# 인증: .env.local 의 SUPABASE_ACCESS_TOKEN
#   https://supabase.com/dashboard/account/tokens
#
# Management API 만 쓴다 — supabase CLI, DB 비밀번호, psql 이 전부 불필요하다.
# (브라우저 로그인은 TTY 가 필요해 에이전트 세션에서 안 되고, psql 은 이 머신에 없었다.)
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="https://api.supabase.com/v1"
REGION="${REGION:-ap-northeast-2}"     # 서울
NAME="${NAME:-teamsync}"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

env_get() {
  [ -f "$ROOT/.env.local" ] || return 0
  grep "^$1=" "$ROOT/.env.local" 2>/dev/null | head -1 | cut -d= -f2- || true
}

# api <METHOD> <PATH> <OUT_FILE> [BODY_FILE]  → HTTP 코드를 stdout, 본문을 OUT_FILE 로
#
# 상태코드를 변수에 담지 않는 이유: RES=$(api ...) 는 서브셸이라 함수가 설정한
# 변수가 부모로 돌아오지 않는다. 코드는 반환값으로, 본문은 파일로 넘긴다.
api() {
  _m="$1"; _p="$2"; _o="$3"; _bf="${4:-}"
  if [ -n "$_bf" ]; then
    curl -sS -o "$_o" -w '%{http_code}' -X "$_m" "$API$_p" \
      -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
      --data-binary "@$_bf"
  else
    curl -sS -o "$_o" -w '%{http_code}' -X "$_m" "$API$_p" \
      -H "Authorization: Bearer $TOKEN"
  fi
}

jq_node() { node -e "$1"; }   # stdin JSON → stdout

# ── 0. 토큰 ──────────────────────────────────────────────────────
TOKEN="${SUPABASE_ACCESS_TOKEN:-$(env_get SUPABASE_ACCESS_TOKEN)}"
if [ -z "$TOKEN" ]; then
  cat <<'NEEDTOKEN'
Supabase 액세스 토큰이 필요합니다.
  1. https://supabase.com/dashboard/account/tokens 에서 토큰 생성
  2. .env.local 에 추가:  SUPABASE_ACCESS_TOKEN=sbp_...
  3. 다시 실행
NEEDTOKEN
  exit 1
fi

OUT=$(mktemp)
cleanup() { rm -f "$OUT"; }
trap cleanup EXIT

# ── 1. 프로젝트 확보 ─────────────────────────────────────────────
PROJECT_REF="${PROJECT_REF:-}"

if [ -z "$PROJECT_REF" ]; then
  say "1/4 · 프로젝트 생성 ($NAME · $REGION)"
  if [ -z "${ORG_ID:-}" ]; then
    api GET /organizations "$OUT" >/dev/null || true
    ORG_ID=$(jq_node 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s);process.stdout.write(a[0]?.id||"")}catch{}})' < "$OUT")
  fi

  if [ -n "${ORG_ID:-}" ]; then
    DB_PASS=$(node -e 'process.stdout.write(require("crypto").randomBytes(18).toString("base64url"))')
    BODY=$(mktemp)
    node -e 'const[n,o,r,p]=process.argv.slice(1);process.stdout.write(JSON.stringify({name:n,organization_id:o,region:r,db_pass:p}))' \
      "$NAME" "$ORG_ID" "$REGION" "$DB_PASS" > "$BODY"
    CODE=$(api POST /projects "$OUT" "$BODY"); rm -f "$BODY"
    case "$CODE" in
      2*)
        printf '%s' "$DB_PASS" > "$ROOT/.supabase-db-password"; chmod 600 "$ROOT/.supabase-db-password"
        PROJECT_REF=$(jq_node 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const p=JSON.parse(s);process.stdout.write(p.ref||p.id||"")}catch{}})' < "$OUT")
        echo "생성됨: $PROJECT_REF (DB 비밀번호는 .supabase-db-password)"
        ;;
      *) echo "생성 실패 (HTTP $CODE): $(head -c 200 "$OUT")" ;;
    esac
  fi
fi

if [ -z "$PROJECT_REF" ]; then
  cat <<MANUAL

이 토큰으로는 프로젝트를 만들 수 없습니다 (조직 접근 권한 없음).
대시보드에서 직접 만드시면 나머지는 이 스크립트가 전부 처리합니다.

  1. https://supabase.com/dashboard/new
  2. Name: $NAME · Region: Northeast Asia (Seoul)
  3. https://supabase.com/dashboard/project/<ref> 의 ref 확인
  4. PROJECT_REF=<ref> ./scripts/setup-supabase.sh

MANUAL
  exit 1
fi

say "프로젝트: $PROJECT_REF"

# ── 2. 준비 상태 ─────────────────────────────────────────────────
say "1/3 · 상태 확인"
ST=""
i=0
while [ $i -lt 60 ]; do
  CODE=$(api GET "/projects/$PROJECT_REF" "$OUT")
  if [ "$CODE" != "200" ]; then
    echo "  프로젝트 조회 실패 (HTTP $CODE): $(head -c 200 "$OUT")"; exit 1
  fi
  ST=$(jq_node 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).status||"")}catch{}})' < "$OUT")
  echo "  status=$ST"
  [ "$ST" = "ACTIVE_HEALTHY" ] && break
  i=$((i+1)); sleep 5
done
[ "$ST" = "ACTIVE_HEALTHY" ] || { echo "아직 준비되지 않았습니다. 잠시 후 다시 실행하세요."; exit 1; }

# ── 3. 스키마 적용 ───────────────────────────────────────────────
say "2/3 · 스키마 적용 (supabase/schema.sql)"
BODY=$(mktemp)
node -e 'const fs=require("fs");process.stdout.write(JSON.stringify({query:fs.readFileSync(process.argv[1],"utf8")}))' \
  "$ROOT/supabase/schema.sql" > "$BODY"
CODE=$(api POST "/projects/$PROJECT_REF/database/query" "$OUT" "$BODY"); rm -f "$BODY"
case "$CODE" in
  2*) echo "  적용 완료" ;;
  *)  echo "  실패 (HTTP $CODE): $(head -c 400 "$OUT")"; exit 1 ;;
esac

BODY=$(mktemp)
printf '%s' '{"query":"select table_name from information_schema.tables where table_schema = '"'"'public'"'"' order by table_name"}' > "$BODY"
CODE=$(api POST "/projects/$PROJECT_REF/database/query" "$OUT" "$BODY"); rm -f "$BODY"
echo "  테이블: $(jq_node 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).map(r=>r.table_name).join(", "))}catch{process.stdout.write(s.slice(0,200))}})' < "$OUT")"

# ── 4. 키 수집 + 환경파일 ────────────────────────────────────────
say "3/3 · 키 수집 및 환경파일 작성"
CODE=$(api GET "/projects/$PROJECT_REF/api-keys" "$OUT")
[ "$CODE" = "200" ] || { echo "키 조회 실패 (HTTP $CODE): $(head -c 200 "$OUT")"; exit 1; }
ANON=$(jq_node 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s);process.stdout.write(a.find(k=>k.name==="anon")?.api_key||"")})' < "$OUT")
SERVICE=$(jq_node 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s);process.stdout.write(a.find(k=>k.name==="service_role")?.api_key||"")})' < "$OUT")
URL="https://${PROJECT_REF}.supabase.co"
[ -n "$ANON" ] && [ -n "$SERVICE" ] || { echo "키를 읽지 못했습니다."; exit 1; }

# 이미 있는 값은 살린다 — 사용자가 직접 넣은 것을 날리지 않는다
TS_TOKEN="$(env_get TEAMSYNC_TOKEN)"
[ -n "$TS_TOKEN" ] || TS_TOKEN=$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))')
ANTHROPIC="$(env_get ANTHROPIC_API_KEY)"
MODEL="$(env_get TEAMSYNC_MODEL)"; [ -n "$MODEL" ] || MODEL="claude-sonnet-5"
PID="$(env_get TEAMSYNC_PROJECT_ID)"; [ -n "$PID" ] || PID="unithon"

[ -f "$ROOT/.env.local" ] && cp "$ROOT/.env.local" "$ROOT/.env.local.bak.$(date +%s)"

cat > "$ROOT/.env.local" <<ENVEOF
# ══════════════════════════════════════════════════════════════════
# TeamSync 환경변수 · 로컬  —  scripts/setup-supabase.sh 가 갱신합니다
# 커밋되지 않습니다 (.gitignore). 팀원 공유는 안전한 경로로.
# ══════════════════════════════════════════════════════════════════

# [수동] Supabase 관리용 토큰 — 셋업 전용. 배포 환경에는 넣지 마세요.
SUPABASE_ACCESS_TOKEN=$TOKEN

# [수동] 요약 LLM — 비면 /api/ingest 가 500 을 냅니다
# https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=$ANTHROPIC
TEAMSYNC_MODEL=$MODEL

# [자동] Supabase — 서버 전용 (service_role 은 클라이언트로 나가면 안 됩니다)
SUPABASE_URL=$URL
SUPABASE_SERVICE_ROLE_KEY=$SERVICE

# [자동] Supabase — 브라우저 (Realtime 구독, RLS 로 읽기만)
NEXT_PUBLIC_SUPABASE_URL=$URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON

# [자동] 훅 ↔ API 공유 시크릿 — 팀원 .claude/settings.json 에도 같은 값
TEAMSYNC_TOKEN=$TS_TOKEN

# [수동] 기본 프로젝트 ID
TEAMSYNC_PROJECT_ID=$PID
ENVEOF
chmod 600 "$ROOT/.env.local"

cat > "$ROOT/.env.vercel" <<VEOF
SUPABASE_URL=$URL
SUPABASE_SERVICE_ROLE_KEY=$SERVICE
NEXT_PUBLIC_SUPABASE_URL=$URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON
TEAMSYNC_TOKEN=$TS_TOKEN
ANTHROPIC_API_KEY=$ANTHROPIC
VEOF
chmod 600 "$ROOT/.env.vercel"

say "완료"
cat <<DONE
  프로젝트    $PROJECT_REF ($REGION)
  URL         $URL
  .env.local  갱신됨
  .env.vercel Vercel 용 6개만 (SUPABASE_ACCESS_TOKEN 제외)

남은 것:
  1. .env.local 의 ANTHROPIC_API_KEY 채우기
  2. npm run dev  →  http://localhost:3000/p/$PID
DONE
