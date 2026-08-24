#!/bin/sh
# EX-7 · 데모 재실행 시 빈 화면 방지 — 리허설 사이마다 실행한다.
#
# 워터마크는 주입 시 전진하므로 리허설 한 번 하면 두 번째부터 아무것도 주입되지 않는다.
# injections 만 지우면 같은 context 가 다시 주입 대상이 된다.
#
# psql 을 쓰지 않는다 — 무대 노트북에 psql 이 있다는 보장이 없다(이 머신엔 없었다).
# PostgREST 로 지우므로 curl 하나면 된다.
#
# 사용:
#   PROJECT_ID=demo ./supabase/demo-reset.sh          # 워터마크만 되감기
#   PROJECT_ID=demo FULL=1 ./supabase/demo-reset.sh   # context·decisions 까지 삭제
#
# 필요한 환경변수 (.env.local 에 이미 있으면 자동으로 읽는다):
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# .env.local 에서 값을 끌어온다 (없으면 이미 export 된 값을 쓴다)
if [ -f "$ROOT/.env.local" ]; then
  for KEY in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY; do
    eval "CUR=\${$KEY:-}"
    if [ -z "$CUR" ]; then
      VAL=$(grep "^${KEY}=" "$ROOT/.env.local" 2>/dev/null | head -1 | cut -d= -f2- || true)
      [ -n "$VAL" ] && export "$KEY=$VAL"
    fi
  done
fi

: "${SUPABASE_URL:?SUPABASE_URL 이 필요합니다 (.env.local 또는 환경변수)}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY 가 필요합니다}"
PROJECT_ID="${PROJECT_ID:-demo}"

wipe() {
  _table="$1"
  _code=$(curl -sS -o /dev/null -w '%{http_code}' \
    -X DELETE "$SUPABASE_URL/rest/v1/${_table}?project_id=eq.${PROJECT_ID}" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "prefer: return=minimal")
  case "$_code" in
    2*) echo "  $_table 삭제 완료" ;;
    *)  echo "  $_table 실패 (HTTP $_code)"; exit 1 ;;
  esac
}

echo "[demo-reset] project_id=$PROJECT_ID"

if [ "${FULL:-0}" = "1" ]; then
  echo "  FULL 초기화 — 컨텍스트까지 지웁니다"
  wipe injections     # context 를 참조하므로 먼저
  wipe decisions
  wipe context
  wipe branches
else
  echo "  워터마크만 되감기 — 같은 컨텍스트가 다시 주입 대상이 됩니다"
  wipe injections
fi

echo "[demo-reset] 완료"
