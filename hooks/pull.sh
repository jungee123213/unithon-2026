#!/bin/sh
# 주입 (FR-3) — SessionStart / UserPromptSubmit
#
# EX-3 · 쓰기 규칙을 읽기 경로에 적용하면 주입이 영원히 안 온다:
#   실행    동기. detach 금지        (async 훅의 additionalContext 는 "다음 대화 턴에" 전달됨
#                                     → B 의 첫 프롬프트를 놓친다. 그게 데모의 전부다)
#   stdout  캡처 필수. 버리면 주입이 사라진다
#   timeout 훅 15 + curl --max-time 4
#
# stdout 은 훅 출력 JSON 전용이다. 다른 것을 절대 찍지 않는다.
#   사용: pull.sh SessionStart | pull.sh UserPromptSubmit
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"

EVENT="${1:-SessionStart}"
STDIN_JSON=$(cat)

{
  ts_configured || { ts_log "pull: L1 미설정"; exit 0; }

  SESSION_ID=$(printf '%s' "$STDIN_JSON" | "$TS_NODE" -e \
    'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).session_id||"")}catch{}})' \
    2>/dev/null) || SESSION_ID=""

  # 실패 큐 재시도 + 고아 세션 회수 (FR-1.4, FR-1.5).
  # 읽기 경로를 막으면 안 되므로 이것만 detach 한다.
  export TEAMSYNC_SELF_SESSION="$SESSION_ID"
  ts_detach "$TS_DIR/flush.sh" --recover

  # L4 · 킬 스위치가 켜져 있으면 주입도 받지 않는다 (대조군 실연이 성립하려면 양방향이어야 한다)
  ts_killed && { ts_log "pull: .teamsync-off → 주입 없음"; exit 0; }
} >>"$TS_LOG" 2>&1

# ── 동기 GET. 실패하면 빈 출력으로 조용히 통과한다 (EX-5) ──
RESP=$(curl -sS --max-time 4 \
  "$TEAMSYNC_API/api/context?project_id=$TEAMSYNC_PROJECT_ID&member=$TEAMSYNC_MEMBER" \
  -H "x-teamsync-token: ${TEAMSYNC_TOKEN:-}" 2>>"$TS_LOG") || RESP=""

if [ -z "$RESP" ]; then
  ts_log "pull: 응답 없음 — 주입 없이 통과"
  exit 0
fi

ts_log "pull: 응답 $(printf '%s' "$RESP" | head -c 160)"

# 계약 §2: injection 문자열을 가공하지 않는다. 영수증 뷰(FR-5.1)가 같은 문자열을 렌더링한다.
printf '%s' "$RESP" | "$TS_NODE" "$TS_DIR/ts.mjs" pullout "$EVENT" 2>>"$TS_LOG" || true

exit 0
