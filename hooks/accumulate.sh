#!/bin/sh
# Stop 훅 (FR-1.1) — last_assistant_message 를 로컬 파일에 누적한다.
#
# EX-4: 트랜스크립트 파일은 비동기로 쓰여서 훅 발화 시점에 마지막 몇 턴이 빠질 수 있다.
#       그래서 트랜스크립트를 읽지 않고 Stop 훅이 직접 주는 값을 쌓는다.
#       랙이 없고, jsonl 스키마 의존도 없고, 자연히 델타가 된다.
#
# 여기서는 전송하지 않는다. 로컬 누적만. 전송은 flush 가 한다.
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"

if [ "${TEAMSYNC_DEBUG:-0}" = "1" ]; then set -x; fi

{
  ts_configured || { ts_log "accumulate: skip (L1 미설정)"; exit 0; }
  ts_killed && { ts_log "accumulate: skip (.teamsync-off)"; exit 0; }
  "$TS_NODE" "$TS_DIR/ts.mjs" accumulate "$TS_STORE"
} 2>>"$TS_LOG" || true

exit 0
