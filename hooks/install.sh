#!/bin/sh
# TeamSync 훅 설치 — 대상 프로젝트에 복사하고 settings.json 을 만든다.
#
#   TEAMSYNC_TOKEN=tsk_... ./hooks/install.sh <대상_폴더> <이름> <PROJECT_ID> <API_URL>
#
# 토큰은 웹의 프로젝트 화면에서 각자 발급받는다 — 그 토큰이 어느 프로젝트의
# 누구인지를 결정하므로, 다른 프로젝트로 새어 나갈 수 없다.
#
# 여기서 지정하는 폴더가 곧 범위다. 그 폴더에서 claude 를 띄웠을 때만 동작한다.
#
# §5.1 L1: 프로젝트 스코프에만 설치한다. ~/.claude/settings.json 에는 절대 넣지 않는다.
set -eu

SRC="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:?사용법: install.sh <대상_프로젝트_경로> <MEMBER> [PROJECT_ID] [API_URL]}"
MEMBER="${2:?MEMBER 가 필요합니다 (A/B/C)}"
PROJECT_ID="${3:-unithon}"
API_URL="${4:-${TEAMSYNC_API:-https://REPLACE-ME.vercel.app}}"
TOKEN="${TEAMSYNC_TOKEN:-REPLACE-ME}"

case "$TARGET" in
  "$HOME"|"$HOME/") echo "거부: 홈 디렉터리에 설치할 수 없습니다 (§5.1 L1)"; exit 1 ;;
esac
[ -d "$TARGET" ] || { echo "대상 디렉터리가 없습니다: $TARGET"; exit 1; }

DEST="$TARGET/.claude/hooks/teamsync"
mkdir -p "$DEST"
for f in lib.sh ts.mjs accumulate.sh flush.sh flush-hook.sh pull.sh; do
  cp "$SRC/$f" "$DEST/$f"
done
chmod +x "$DEST"/*.sh

SETTINGS="$TARGET/.claude/settings.json"
if [ -f "$SETTINGS" ]; then
  cp "$SETTINGS" "$SETTINGS.bak.$(date +%s)"
  echo "기존 settings.json 을 백업했습니다: $SETTINGS.bak.*"
  echo "!! 병합은 수동으로 하세요. 템플릿: $SRC/settings.template.json"
else
  sed -e "s|https://REPLACE-ME.vercel.app|$API_URL|" \
      -e "s|\"TEAMSYNC_PROJECT_ID\": \"unithon\"|\"TEAMSYNC_PROJECT_ID\": \"$PROJECT_ID\"|" \
      -e "s|\"TEAMSYNC_MEMBER\": \"REPLACE-ME\"|\"TEAMSYNC_MEMBER\": \"$MEMBER\"|" \
      -e "s|\"TEAMSYNC_TOKEN\": \"REPLACE-ME\"|\"TEAMSYNC_TOKEN\": \"$TOKEN\"|" \
      "$SRC/settings.template.json" > "$SETTINGS"
  echo "생성: $SETTINGS  (MEMBER=$MEMBER, PROJECT_ID=$PROJECT_ID)"
fi

echo ""
echo "설치 완료: $DEST"
echo "확인:  cd $TARGET && claude   → 세션 시작 후  cat ~/.claude/teamsync/teamsync.log"
echo "끄기:  touch $TARGET/.teamsync-off"
