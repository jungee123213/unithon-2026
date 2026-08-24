#!/bin/sh
# SessionEnd(clear|logout) / PreCompact 훅 진입점 (FR-1.2, FR-1.3)
#
# 이 스크립트는 세션 종료 경로에 있다. 하는 일은 딱 두 가지다:
#   1. stdin 훅 JSON 에서 session_id 를 꺼낸다 (~40ms)
#   2. 진짜 전송은 detach 해서 넘긴다 → 세션 종료를 지연시키지 않는다
#
# EX-2: SessionEnd 기본 예산은 1.5초다. 그래서 여기서 네트워크를 만지지 않는다.
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"

STDIN_JSON=$(cat)
SESSION_ID=$(printf '%s' "$STDIN_JSON" | "$TS_NODE" -e \
  'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).session_id||"")}catch{}})' \
  2>/dev/null) || SESSION_ID=""

if [ -n "$SESSION_ID" ]; then
  ts_log "flush-hook: detaching flush for $SESSION_ID"
  ts_detach "$TS_DIR/flush.sh" "$SESSION_ID"
else
  ts_log "flush-hook: session_id 없음 — 건너뜀"
fi

exit 0
