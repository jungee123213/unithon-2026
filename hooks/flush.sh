#!/bin/sh
# 전송 (FR-1.2, 1.4, 1.5 / FR-2.1, 2.2, 2.5)
#
# 훅이 아니라 CLI 로 먼저 완성한다 — 설계 문서 §9.2 의 완화책.
#   ./flush.sh <session_id>   특정 세션 전송
#   ./flush.sh --recover      고아 세션 회수 + pending 큐 재시도
#   ./flush.sh --list         저장된 세션 목록
#
# 이 스크립트는 detach 된 상태로 실행된다. stdout/stderr 는 아무도 안 본다 → 전부 로그로.
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"

if [ "${TEAMSYNC_DEBUG:-0}" = "1" ]; then set -x; fi

TS_SESSIONS="$TS_STORE/sessions"
TS_PENDING="$TS_STORE/pending"

# ── 전송 1건. 0=성공/영구실패(큐에서 제거), 1=일시실패(재시도) ──
ts_post() {
  _body_file="$1"
  _resp="$(mktemp)"
  _code=$(curl -sS -o "$_resp" -w '%{http_code}' --max-time 20 \
      -X POST "$TEAMSYNC_API/api/ingest" \
      -H 'content-type: application/json' \
      -H "x-teamsync-token: ${TEAMSYNC_TOKEN:-}" \
      --data-binary "@$_body_file" 2>>"$TS_LOG") || _code="000"

  ts_log "POST /api/ingest -> $_code $(head -c 200 "$_resp" 2>/dev/null)"
  rm -f "$_resp"

  case "$_code" in
    2*)   return 0 ;;                        # 도착
    4*)   ts_log "4xx — 재시도하지 않음"; return 0 ;;   # 계약 §1: 4xx 는 큐에서 버린다
    *)    return 1 ;;                        # 5xx / 네트워크 → pending
  esac
}

# ── 세션 1개 처리 ──
ts_flush_session() {
  _sid="$1"
  _meta="$TS_SESSIONS/$_sid.meta.json"
  [ -f "$TS_SESSIONS/$_sid.jsonl" ] || { ts_log "flush $_sid: 누적 파일 없음"; return 0; }

  _cwd=$("$TS_NODE" -e 'const f=process.argv[1];try{process.stdout.write((JSON.parse(require("fs").readFileSync(f,"utf8")).cwd)||"")}catch{}' "$_meta" 2>/dev/null)
  _pdir=$("$TS_NODE" -e 'const f=process.argv[1];try{process.stdout.write((JSON.parse(require("fs").readFileSync(f,"utf8")).project_dir)||"")}catch{}' "$_meta" 2>/dev/null)
  [ -n "$_cwd" ] || _cwd="$PWD"

  # L4 · 킬 스위치 (§5.1) — 세션 단위로 즉시 끌 수 있다 (FR-2.5)
  if ts_killed "$_pdir"; then
    ts_log "flush $_sid: .teamsync-off → 전송 안 함, 누적분 폐기"
    rm -f "$TS_SESSIONS/$_sid.jsonl" "$_meta"
    return 0
  fi

  # L2 · 브랜치 화이트리스트 (§5.1, FR-2.2) — 개인 실험 브랜치는 애초에 나가지 않는다
  _branch=$(ts_current_branch "$_cwd")
  if ! ts_branch_allowed "$_branch"; then
    ts_log "flush $_sid: 브랜치 '$_branch' 화이트리스트 밖 → 전송 안 함, 누적분 폐기"
    rm -f "$TS_SESSIONS/$_sid.jsonl" "$_meta"
    return 0
  fi

  # 진행사항 문서용 git 사실 — 실패해도 전송을 막지 않는다
  _merged=$(ts_merged_branches "$_cwd" 2>/dev/null || echo "")
  [ -n "$_merged" ] && ts_log "flush $_sid: merged=$_merged"

  # 페이로드 조립 (EX-6 길이 필터 포함). exit 3 = 보낼 것 없음
  _body="$TS_PENDING/$_sid.json"
  if ! "$TS_NODE" "$TS_DIR/ts.mjs" payload "$TS_STORE" "$_sid" "$_branch" "$_merged" > "$_body" 2>>"$TS_LOG"; then
    ts_log "flush $_sid: 보낼 것 없음 (짧거나 빔)"
    rm -f "$_body" "$TS_SESSIONS/$_sid.jsonl" "$_meta"
    return 0
  fi

  # 누적 파일은 여기서 지운다. 페이로드는 pending 에 있으므로 유실되지 않는다 (FR-1.4)
  rm -f "$TS_SESSIONS/$_sid.jsonl" "$_meta"

  if ts_post "$_body"; then
    rm -f "$_body"
  else
    ts_log "flush $_sid: 전송 실패 → pending 유지, 다음 SessionStart 에서 재시도"
  fi
  return 0
}

# ── pending 큐 재시도 (FR-1.4) ──
ts_retry_pending() {
  for _f in "$TS_PENDING"/*.json; do
    [ -e "$_f" ] || continue
    ts_log "retry pending: $(basename "$_f")"
    if ts_post "$_f"; then rm -f "$_f"; fi
  done
}

# ── 고아 세션 회수 (FR-1.5) ──
# SessionEnd 가 발화하지 않은 세션(크래시·창 닫기)을 다음 SessionStart 에서 회수한다.
# 판정 기준: 그 세션을 만든 claude 프로세스가 죽었는가. 같은 프로젝트·같은 멤버만 건드린다
# (대조군 실연에서 사본 A 가 사본 B 의 살아있는 세션을 flush 해버리면 안 된다).
ts_recover_orphans() {
  "$TS_NODE" "$TS_DIR/ts.mjs" sessions "$TS_STORE" 2>>"$TS_LOG" | while IFS="$(printf '\t')" read -r _sid _proj _mem _pid _c _pd; do
    [ -n "$_sid" ] || continue
    [ "$_proj" = "${TEAMSYNC_PROJECT_ID:-}" ] || continue
    [ "$_mem" = "${TEAMSYNC_MEMBER:-}" ] || continue
    [ "$_sid" != "${TEAMSYNC_SELF_SESSION:-}" ] || continue
    if [ -n "$_pid" ] && [ "$_pid" -gt 1 ] 2>/dev/null && kill -0 "$_pid" 2>/dev/null; then
      continue                      # 아직 살아있는 세션 — 남의 것이든 내 것이든 건드리지 않는다
    fi
    ts_log "고아 세션 회수: $_sid (owner pid $_pid 없음)"
    ts_flush_session "$_sid"
  done
}

# ── 진입점 ──
ts_configured || { ts_log "flush: L1 미설정 — 아무것도 하지 않음"; exit 0; }

case "${1:-}" in
  --recover) ts_recover_orphans; ts_retry_pending ;;
  --list)    "$TS_NODE" "$TS_DIR/ts.mjs" sessions "$TS_STORE" ;;
  "")        ts_log "flush: session_id 인자 필요"; exit 0 ;;
  *)         ts_flush_session "$1" ;;
esac

exit 0
