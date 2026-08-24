#!/bin/sh
# TeamSync 훅 공용 — 설계 문서 §5.1 범위 정책 4계층, EX-5 짜증 방지
#
# EX-5: 훅이 보이는 에러를 내거나 세션을 지연시키면 팀원이 훅을 꺼버린다.
#       그 순간 제품이 존재하지 않게 된다. 그래서 기본은 전부 조용히 실패한다.
#       TEAMSYNC_DEBUG=1 이면 그 침묵을 걷어낸다.

TS_DIR="$(cd "$(dirname "$0")" && pwd)"
TS_STORE="${TEAMSYNC_STORE:-$HOME/.claude/teamsync}"
TS_LOG="$TS_STORE/teamsync.log"
TS_NODE="${TEAMSYNC_NODE:-node}"

mkdir -p "$TS_STORE/sessions" "$TS_STORE/pending" 2>/dev/null || true

ts_log() {
  printf '%s [%s] %s\n' "$(date '+%H:%M:%S')" "${TEAMSYNC_MEMBER:-?}" "$*" >> "$TS_LOG" 2>/dev/null || true
  if [ "${TEAMSYNC_DEBUG:-0}" = "1" ]; then
    printf '[teamsync] %s\n' "$*" >&2
  fi
}

# ── L4 예외 (§5.1) · 킬 스위치 ──────────────────────────────────
# 프로젝트 단위여야 한다. 홈 디렉터리로 하면 대조군 실연에서 한쪽만 못 끈다.
ts_killed() {
  _pd="${1:-$CLAUDE_PROJECT_DIR}"
  [ -n "$_pd" ] && [ -f "$_pd/.teamsync-off" ]
}

# ── L1 범위 (§5.1) · 필수 환경변수 ──────────────────────────────
# 프로젝트 스코프 .claude/settings.json 의 env 로만 들어온다.
# 유저 스코프에 설치하면 이 값들이 없어서 아무 일도 일어나지 않는다 — 그게 의도된 동작이다.
ts_configured() {
  [ -n "${TEAMSYNC_API:-}" ] && [ -n "${TEAMSYNC_PROJECT_ID:-}" ] && [ -n "${TEAMSYNC_MEMBER:-}" ]
}

# ── L2 브랜치 (§5.1) · 화이트리스트 ─────────────────────────────
# 기본값 main, develop, feature/*. 개인 실험 브랜치는 자동 제외된다.
ts_branch_allowed() {
  _b="$1"
  [ -n "$_b" ] || return 1
  _pats="${TEAMSYNC_BRANCHES:-main develop feature/*}"
  for _p in $_pats; do
    # shellcheck disable=SC2254  # 의도적 glob
    case "$_b" in $_p) return 0 ;; esac
  done
  return 1
}

ts_current_branch() {
  git -C "${1:-.}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo ""
}

# ── 기준 브랜치 판별 ────────────────────────────────────────────
# origin/HEAD 가 있으면 그걸 믿고, 없으면 흔한 이름을 순서대로 찾는다.
ts_base_branch() {
  _d="${1:-.}"
  _b=$(git -C "$_d" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')
  if [ -n "$_b" ]; then printf '%s' "$_b"; return 0; fi
  for _c in main master develop; do
    if git -C "$_d" rev-parse --verify --quiet "$_c" >/dev/null 2>&1; then
      printf '%s' "$_c"; return 0
    fi
  done
  printf ''
}

# ── 진행사항 문서의 상태 근거 ───────────────────────────────────
# "이 브랜치가 기준 브랜치에 들어갔는가" — git 이 아는 사실이다. 추정이 아니다.
# 웹앱은 git 에 접근할 수 없으므로 훅이 보내는 것 말고는 알 방법이 없다.
ts_merged_branches() {
  _d="${1:-.}"
  _base=$(ts_base_branch "$_d")
  [ -n "$_base" ] || return 0
  git -C "$_d" branch --merged "$_base" --format='%(refname:short)' 2>/dev/null \
    | grep -v "^${_base}$" \
    | tr '\n' ',' | sed 's/,$//'
}

# ── EX-1 · macOS 에 setsid 가 없다 ──────────────────────────────
# nohup ... & 는 부족하다 — SIGHUP 만 무시할 뿐 자식이 Claude Code 프로세스 그룹에 남는다.
# perl fork+setsid+exec 는 이 머신에서 검증됨: 부모 즉시 반환, 부모 그룹 SIGKILL 후에도 자식 생존.
ts_detach() {
  perl -e 'use POSIX; fork and exit; POSIX::setsid(); exec @ARGV' -- "$@" \
    >/dev/null 2>&1 </dev/null || true
}
