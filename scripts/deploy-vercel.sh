#!/bin/sh
# Vercel 배포 — 프로젝트 연결 → 환경변수 주입 → 배포 → 공개 URL 확인.
#
#   ./scripts/deploy-vercel.sh
#
# 인증: .env.local 의 VERCEL_TOKEN
#   https://vercel.com/account/tokens
#
# 브라우저 로그인(`vercel login`)은 TTY 가 필요해 에이전트 세션에서 안 된다.
# Supabase 셋업과 같은 이유로 토큰을 파일에서 읽는다.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VC="npx --yes vercel@latest"
PROJECT="${VERCEL_PROJECT:-teamsync}"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

env_get() {
  [ -f "$ROOT/.env.local" ] || return 0
  grep "^$1=" "$ROOT/.env.local" 2>/dev/null | head -1 | cut -d= -f2- || true
}

TOKEN="${VERCEL_TOKEN:-$(env_get VERCEL_TOKEN)}"
if [ -z "$TOKEN" ]; then
  cat <<'NEEDTOKEN'
Vercel 액세스 토큰이 필요합니다.

  1. https://vercel.com/account/tokens 에서 토큰 생성
     Scope 는 계정 전체, 만료는 짧게 잡아도 됩니다.
  2. .env.local 에 한 줄 추가:

       VERCEL_TOKEN=여기에붙여넣기

  3. 다시 실행: ./scripts/deploy-vercel.sh

.env.local 은 .gitignore 에 있어 커밋되지 않습니다.
NEEDTOKEN
  exit 1
fi

cd "$ROOT"

# ── 1. 프로젝트 연결 ─────────────────────────────────────────────
say "1/4 · 프로젝트 연결 ($PROJECT)"
if [ -f "$ROOT/.vercel/project.json" ]; then
  echo "  이미 연결됨"
else
  $VC link --yes --project "$PROJECT" --token "$TOKEN"
fi

# ── 2. 환경변수 ──────────────────────────────────────────────────
# .env.vercel 의 값만 올린다. SUPABASE_ACCESS_TOKEN·VERCEL_TOKEN 은
# 셋업 전용이고 계정 전체 권한이라 배포 환경에 두지 않는다.
#
# CLI(`vercel env add`)를 쓰지 않는다: CLI 는 새 변수를 Sensitive 로 만드는데
# Sensitive 는 클라이언트에 노출될 수 없어 NEXT_PUBLIC_ 과 양립하지 않는다.
# 그 거부를 `|| true` 가 삼켜 NEXT_PUBLIC_* 3개가 빠진 채 배포됐고, 미들웨어가
# 500 을 냈다. API 로 type 을 직접 지정하고, 실패하면 여기서 멈춘다.
say "2/4 · 환경변수 주입"
[ -f "$ROOT/.env.vercel" ] || { echo ".env.vercel 이 없습니다. scripts/setup-supabase.sh 를 먼저 실행하세요."; exit 1; }
VERCEL_TOKEN="$TOKEN" node "$ROOT/scripts/sync-vercel-env.mjs" || {
  echo "환경변수 주입 실패 — 배포하지 않습니다."; exit 1;
}

# ── 3. 배포 ──────────────────────────────────────────────────────
say "3/4 · 프로덕션 배포"
$VC deploy --prod --yes --token "$TOKEN" 2>&1 | tee /dev/stderr >/dev/null

# ── 4. 훅이 쓸 URL 확정 ──────────────────────────────────────────
#
# 함정: vercel deploy 가 출력하는 배포별 URL
#   (teamsync-8wxd1rv55-<scope>.vercel.app)
# 은 Deployment Protection 이 걸려 302 로 SSO 페이지로 보낸다.
# 훅이 이걸 쓰면 302 HTML 을 받고, `|| true` 와 `>/dev/null` 때문에
# 에러 하나 없이 아무 일도 일어나지 않는다 — EX-1 의 setsid 와 같은 실패 모양이다.
#
# 그래서 배포 출력이 아니라 프로젝트의 production alias 를 조회한다.
say "4/4 · 공개 URL 확인"
ORG=$(node -e 'try{process.stdout.write(require("./.vercel/project.json").orgId||"")}catch{}' 2>/dev/null)
ALIAS=$(curl -sS "https://api.vercel.com/v9/projects/$PROJECT${ORG:+?teamId=$ORG}" \
  -H "Authorization: Bearer $TOKEN" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      try{
        const al=(JSON.parse(s)?.targets?.production?.alias)||[];
        // 배포 해시가 박힌 것과 스코프가 붙은 긴 것을 빼고 가장 짧은 것
        const stable=al.filter(a=>!/-[a-z0-9]{8,}-/.test(a)).sort((x,y)=>x.length-y.length)[0];
        process.stdout.write(stable||al[0]||"");
      }catch{}
    })')

if [ -z "$ALIAS" ]; then
  echo "  별칭을 읽지 못했습니다. 대시보드에서 Production URL 을 확인하세요."
  exit 1
fi
URL="https://$ALIAS"

# 실제로 공개 접근이 되는지 확인한다 — 302 면 훅이 조용히 실패한다
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/context?project_id=probe&member=probe")
echo "  $URL  →  HTTP $CODE"
case "$CODE" in
  200|400|401) : ;;   # 앱이 응답함 (401 은 토큰 헤더가 없어서 정상)
  30*) echo "  !! 리다이렉트됩니다. Deployment Protection 을 끄거나 다른 별칭을 쓰세요."; exit 1 ;;
  *)   echo "  !! 예상 밖 응답. 훅을 붙이기 전에 확인하세요." ;;
esac

PID="$(env_get TEAMSYNC_PROJECT_ID)"; [ -n "$PID" ] || PID="hankki"
TS_TOKEN="$(env_get TEAMSYNC_TOKEN)"

say "완료"
cat <<DONE
  배포 URL   $URL
  화면       $URL/p/$PID

이제 각 팀원이 자기 프로젝트에 훅을 설치하면 연동됩니다:

  TEAMSYNC_TOKEN=$TS_TOKEN \\
    ./hooks/install.sh <프로젝트경로> <본인이름> $PID $URL

확인:
  curl -s -o /dev/null -w '%{http_code}\\n' "$URL/p/$PID"
DONE
