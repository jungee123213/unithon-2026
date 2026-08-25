# no meeting

> 회의가 열리기 전에 판정한다.

확인으로 끝나는 일은 회의가 되지 않는다. 사람이 판단할 것만 위로 올라온다.

판정의 근거는 이 제품이 만들지 않는다 — 세션 요약 훅(아래) · 이슈트래커 · 저장소 ·
알림에서 읽어 온다. 근거가 없으면 조건은 FAIL 이 아니라 UNKNOWN 이고,
UNKNOWN 이 하나라도 있으면 회의를 없애지 않는다.

---

## 세션 요약 훅

> 보고하지 않는다. 읽지 않는다.

각자 로컬에서 AI CLI를 띄우면 에이전트들이 서로의 존재를 모른다. 구조적으로 눈이 멀어 있어서
사람이 눈 역할을 대신한다 — git log를 훑고, PR을 확인하고, "저 이거 했어요"를 알린다.

이 훅이 그 중계기 노릇을 없앤다. A의 세션 요약이 B의 **에이전트**에게 흘러가고,
B는 아무것도 읽지 않는다.

설계 문서: `~/.gstack/projects/Desktop/qhrtj07-unknown-design-20260824-174007.md`
트랙 간 계약: [`docs/CONTRACT.md`](docs/CONTRACT.md) ← **바꾸려면 세 트랙이 같이 바꾼다**

---

## 구조

```
hooks/          T1 · 로컬 훅 (각 팀원 머신에 설치됨)
  accumulate.sh   Stop        → last_assistant_message 를 로컬에 누적
  flush-hook.sh   SessionEnd  → session_id 추출 후 즉시 detach (세션 종료를 막지 않음)
  flush.sh        (detached)  → 범위 판정 → POST /api/ingest, 실패 시 pending 큐
  pull.sh         SessionStart→ GET /api/context → additionalContext 주입 (동기)
  ts.mjs                      → JSON 담당 (jq 의존성 없음)
  install.sh                  → 대상 프로젝트에 설치

app/api/        T2 · 백엔드
  ingest/         요약 LLM + decisions + 민감정보 필터
  context/        워터마크 + 주입 문자열 렌더링

app/p/          T3 · 프론트
  [projectId]/no-meeting/   오늘 — 신청서 · 판정 대기 큐 · 최근 판정
    e/[id]/                 판정 상세 — 유형 → 근거 → 조건 → 결과
    e/[id]/decision/        결정 카드 — "왜 제가 받았나요"
    e/[id]/prescription/    회의 처방전 — 없앨 수 없을 때 줄인다
    ledger/                 결정 원장 + 정책
    connections/            커넥터 연결
  [projectId]/inbox/    결정 인박스 — 훅이 뽑은 결정과 판정이 만든 결정 카드가 한 큐로
  [projectId]/progress/ 진행사항 — 비개발자가 보는 작업현황 (작업별 / 사람별)

supabase/       스키마 + 데모 리셋
lib/no-meeting/ 판정 도메인
  derive.ts       근거 → 게이트 입력값. 계산 못하면 null(=UNKNOWN)
  engine.ts       게이트는 파생값만 읽는다. 문장을 읽지 않는다
  classify.ts     신청서 → 안건 · 유형 점수 (LLM)
  evidence-teamsync.ts  context · branches · injections → 근거
lib/            공용 타입(계약) · 요약 · 마스킹 · 주입 템플릿 · 카운터
```

---

## 셋업

### 1. Supabase (서울 리전)

SQL Editor에 `supabase/schema.sql` 전체를 붙여넣고 실행. 재실행해도 안전하다.

### 2. 환경변수

`.env.example` 을 복사해 `.env.local` 로. Vercel에도 같은 값을 넣는다.
`SUPABASE_SERVICE_ROLE_KEY` 와 `ANTHROPIC_API_KEY` 는 **절대 커밋하지 않는다** (§9.3).

### 3. 웹 실행

```sh
npm run dev            # http://localhost:3000/p/unithon
npm run check:rules    # 판정 규칙 회귀 확인 (DB · LLM 없이)
```

DB 없이 화면만 보려면 `/preview`, `/preview/inbox`, `/preview/progress`.
시드는 `lib/seed.ts` 에 있고 실제 계약과 같은 모양이라, 여기서 잘 보이면 실제 데이터에서도 잘 보인다.

### 4. 배포

```sh
./scripts/deploy-vercel.sh
```

`.env.local` 의 `VERCEL_TOKEN` 을 읽어 프로젝트 연결 → 환경변수 주입 → 배포 →
**공개 URL 확인**까지 한다.

마지막 단계가 별도로 있는 이유: `vercel deploy` 가 출력하는 배포별 URL
(`teamsync-8wxd1rv55-<scope>.vercel.app`)에는 Deployment Protection 이 걸려 있어
302 로 SSO 페이지를 돌려준다. 훅이 그 URL 을 쓰면 302 HTML 을 받고 `|| true` 와
`>/dev/null` 때문에 **에러 하나 없이 아무 일도 일어나지 않는다** — EX-1 의 `setsid`
와 같은 실패 모양이다. 그래서 배포 출력이 아니라 production alias 를 조회하고,
실제로 200 이 오는지 확인한 뒤에 그 URL 을 알려준다.

### 5. 훅 설치 (팀원 각자)

```sh
TEAMSYNC_TOKEN=<공유시크릿> ./hooks/install.sh <프로젝트경로> <MEMBER> <PROJECT_ID> <API_URL>
```

**프로젝트 스코프에만 설치한다.** `~/.claude/settings.json` 에 넣으면 안 된다 (§5.1 L1) —
관련 없는 프로젝트의 세션까지 전송된다.

확인:
```sh
cat ~/.claude/teamsync/teamsync.log      # 훅이 남기는 유일한 흔적
./hooks/flush.sh --list                  # 저장된 세션
TEAMSYNC_DEBUG=1 claude                  # || true 우회 + stderr 로깅
```

끄기: `touch <프로젝트경로>/.teamsync-off` — 이 파일 하나로 쓰기와 읽기가 동시에 멈춘다.

---

## 무엇이 전송되고 무엇이 전송되지 않는가 (§5.1)

필터링도 자동이다. 사람이 매번 판단하면 "사람의 일"이 다시 생기고, 그건 소멸이 아니라
자동화로의 후퇴다.

| 계층 | 규칙 | 어디서 |
|---|---|---|
| **L1 범위** | 프로젝트 스코프 `.claude/settings.json` 에만 설치 | 설치 방식 |
| **L2 브랜치** | 화이트리스트에서만 전송 (기본 `main`, `develop`, `feature/*`) | `flush.sh` |
| **L3 내용** | 요약 LLM 이 팀 관련성 판정 + 민감정보 제외를 동시에 | `lib/summarize.ts` |
| **L4 예외** | `.teamsync-off` 존재 시 즉시 중단 | `lib.sh` |

브랜치 화이트리스트는 `TEAMSYNC_BRANCHES` 로 바꾼다 (공백 구분, glob 가능).
민감정보는 프롬프트로 한 번, 정규식으로 한 번 — 총 두 번 거른다 (`lib/redact.ts`).

---

## 검증된 플랫폼 사실 (재현하려면 알아야 하는 것)

| 사실 | 결과 | 대응 |
|---|---|---|
| macOS 에 `setsid` 가 없다 | 실측 확인 | `perl -e 'fork and exit; POSIX::setsid(); exec @ARGV'` (생존 검증됨) |
| `nohup ... &` 로는 부족 | SIGHUP 만 무시, 프로세스 그룹에 잔류 | 위와 같음 |
| `settings.json` 의 `env` | 훅 프로세스까지 도달함 | 설정을 여기 둔다 |
| `Stop` 훅 stdin | `last_assistant_message` 포함 | 트랜스크립트를 읽지 않는다 (EX-4) |
| `SessionEnd` 기본 예산 | 1.5초 | `timeout: 10` + 즉시 detach |
| async 훅의 `additionalContext` | **다음 턴에** 전달됨 | 읽기 경로는 동기 + stdout 캡처 (EX-3) |

주입은 system reminder 로 들어가므로 트랜스크립트를 눈으로 봐선 확인되지 않는다.
`claude --debug` 로 보거나, 에이전트에게 직접 물어볼 것.

---

## 데모 (§8)

폴더 사본 3개. **worktree 를 쓰지 않는다** — worktree 에서도 `$CLAUDE_PROJECT_DIR` 가
원본 루트를 가리켜 두 사본이 같은 `settings.json` 을 읽는다 = 같은 멤버가 된다.

| 사본 | 설정 | 쓰임 |
|---|---|---|
| A | `MEMBER=A`, `FORCE=1` | 전파 (보내는 쪽) |
| B | `MEMBER=B`, `FORCE=1` | 전파 (받는 쪽) |
| B-off | `.teamsync-off` | 대조군 (사전 녹화) |

리허설 사이마다: `PROJECT_ID=demo ./supabase/demo-reset.sh`
워터마크는 주입 시 전진하므로 이걸 안 하면 두 번째 리허설에서 아무것도 주입되지 않는다 (EX-7).


---

## 진행사항 문서

`/p/[projectId]/progress` — **개발자가 아닌 팀원**이 작업현황을 보는 화면이다.

두 가지를 하지 않는다 (설계 문서 §4 W · §12 에서 잘라낸 것):

- **작업을 쪼개지 않는다.** 묶는 축은 `context.branch` — 실제 데이터에 있는 것뿐이다.
- **진행률을 추정하지 않는다.** 상태는 git 머지 여부에서만 나온다.

| 상태 | 판정 근거 |
|---|---|
| `기준 브랜치` | `main` · `master` · `develop` |
| `머지됨` | `git branch --merged` 에 있음 |
| `진행중` | 머지 전 + 마지막 기록 24시간 이내 |
| `멈춤` | 머지 전 + 24시간 넘게 기록 없음 |

머지 사실은 웹앱이 알 수 없다 — git 에 접근할 수 없기 때문이다. 그래서 `flush.sh` 가
전송할 때 `git branch --merged` 결과를 같이 보내고, 서버가 `branches` 테이블을 갱신한다.
누가 세션을 끝내든 팀 전체의 브랜치 상태가 최신이 된다.

**한 문장을 두 독자에게 쓸 수 없어서** 요약 LLM 이 한 호출에서 세 벌을 낸다:

| 필드 | 독자 | 예 |
|---|---|---|
| `summary` | 동료의 **에이전트** | "injections 테이블에 batch_id·rendered 컬럼을 추가했습니다" |
| `summary_plain` | 이 프로젝트의 **비개발자** | "동료에게 실제로 전달된 문장을 화면에 그대로 보여줄 수 있게 저장 구조를 바꿨습니다" |
| `work_label` | 문서 섹션 제목 | "영수증 화면" |

`work_label` 은 사실이 아니라 **명명**이다. 브랜치명이 `fix2` 여도 문서가 읽히게 하려고 넣었다.
문서 오른쪽 위 토글로 개발자 표현을 겹쳐 볼 수 있고, **작업별 / 사람별** 로 축을 바꿀 수 있다.

사람별에서 "지금 하는 일"이라 쓰지 않고 **"가장 최근 기록"** 이라고 쓴다 — 지금 뭘 하는지는
모르고, 마지막으로 무엇을 남겼는지만 알기 때문이다. 기여도·업무량도 세지 않는다.
