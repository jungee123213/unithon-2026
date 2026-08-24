# 트랙 간 계약 (고정)

> 설계 문서 §9.2 "계약 먼저 고정한다"의 산출물.
> **이 파일을 바꾸려면 세 트랙이 같이 바꾼다.** 그 외에는 서로를 기다리지 않는다.

| 경계 | 계약 | 위치 |
|---|---|---|
| T1(훅) ↔ T2(백엔드) | HTTP 페이로드 JSON 스키마 | 이 문서 §1, §2 |
| T2(백엔드) ↔ T3(프론트) | 테이블 스키마 | `supabase/schema.sql` + `lib/types.ts` |

공통 인증: 모든 API 요청에 `x-teamsync-token: $TEAMSYNC_TOKEN` 헤더 (§9.3).
토큰 불일치 → `401 {"ok":false,"error":"unauthorized"}`.

---

## 1. `POST /api/ingest` — 쓰기 (T1 → T2)

`flush.sh`가 detach된 상태에서 호출. 응답을 아무도 안 읽으므로 **상태 코드만 성공/실패 판정에 쓴다.**

### 요청

```jsonc
{
  "project_id": "unithon",           // 필수. TEAMSYNC_PROJECT_ID
  "member":     "A",                 // 필수. TEAMSYNC_MEMBER
  "session_id": "9f2c-...",          // 필수. 훅 stdin의 session_id (멱등키)
  "branch":     "feature/payment",   // 필수. flush 시점의 현재 브랜치
  "turns": [                         // 필수. Stop 훅이 누적한 last_assistant_message, 시간순
    { "ts": "2026-08-24T14:30:02Z", "text": "결제 모듈 리팩터링 완료..." }
  ],
  "client_ts": "2026-08-24T14:32:10Z",
  "force": false,                    // TEAMSYNC_FORCE=1 이면 true (EX-6 길이 필터 무시)

  // 진행사항 문서(§ 아래)의 상태 근거. git branch --merged 결과 전부.
  // 웹앱은 git 에 접근할 수 없으므로 훅이 보내는 것 말고는 알 방법이 없다.
  "merged_branches": ["feature/ingest", "feature/hooks"]
}
```

### 응답

| 코드 | 본문 | 의미 |
|---|---|---|
| 200 | `{"ok":true,"skipped":false,"context_id":12,"decisions":1}` | context 1행 생성 |
| 200 | `{"ok":true,"skipped":true,"reason":"not_team_relevant"}` | L3 LLM이 `{skip:true}` (FR-2.3) |
| 200 | `{"ok":true,"skipped":true,"reason":"too_short"}` | EX-6 |
| 200 | `{"ok":true,"skipped":true,"reason":"duplicate"}` | 같은 `session_id` 재전송 |
| 400 | `{"ok":false,"error":"invalid_body"}` | 스키마 불일치 |
| 401 | `{"ok":false,"error":"unauthorized"}` | 토큰 불일치 |
| 5xx | — | **T1은 pending 큐로 보관하고 재시도** (FR-1.4) |

> **재시도 안전성:** `session_id`가 멱등키다. 같은 `session_id`로 두 번 오면 두 번째는
> `skipped:"duplicate"`. T1은 4xx를 받으면 큐에서 버리고, 5xx/네트워크 실패만 재시도한다.

### T2가 책임지는 것
- L3 판정 + 요약 + `decisions[]` + `summary_plain` + `work_label` 산출을 **LLM 단일 호출**로 (FR-4.1)
- 사후 정규식 마스킹 (§5.1): `sk-`, `ghp_`, `Bearer `, 이메일, 32자 이상 hex
- `context` 1행 + `decisions` N행 삽입
- `branches` 갱신 — **요약 skip 여부와 무관하게 먼저 한다.** 팀과 무관한 세션에서도
  git 사실은 유효하고, 이 값이 낡으면 "머지됨"이 영영 뜨지 않는다.

### T1이 책임지는 것 (T2는 신뢰만 한다)
- L1 범위 · L2 브랜치 화이트리스트 · L4 킬스위치 — **전송 자체를 안 함**
- `turns` 누적, 고아 세션 회수, pending 큐

---

## 2. `GET /api/context` — 읽기 (T2 → T1)

`pull.sh`가 **동기로** 호출 (EX-3: detach 금지, stdout 캡처 필수).

### 요청
```
GET /api/context?project_id=unithon&member=A
x-teamsync-token: ...
```

### 응답 (200)
```jsonc
{
  "ok": true,
  "count": 2,
  "injection": "[TeamSync] 이 프로젝트에서 ...",  // §5.3 템플릿이 렌더링된 최종 문자열
  "items": [
    { "context_id": 11, "member": "B", "summary": "...", "created_at": "2026-08-24T14:31:00Z" }
  ]
}
```

주입할 것이 없으면 `{"ok":true,"count":0,"injection":"","items":[]}`.

### 규칙 (§5.2 — 전부 서버가 수행)
```
워터마크 = select coalesce(max(context_id),0) from injections
           where project_id=$P and member=$M
대상     = context where project_id=$P and id > 워터마크 and member != $M
           order by id limit 5, 누적 2000자 초과 시 절단
후처리   = 반환한 각 건마다 injections 1행 삽입
```

> **결정:** `injections` 기록은 **서버가 GET 응답 시점에** 한다. 훅이 주입에 실패해도
> 워터마크는 전진한다 — 대신 훅 로직이 단순해지고 재현 가능하다. 리허설 사이엔
> `supabase/demo-reset.sh`로 되돌린다 (EX-7).

### T1이 책임지는 것
- 이 문자열을 그대로 `additionalContext`에 넣는다. **가공 금지** — 영수증 뷰(FR-5.1)가
  같은 문자열을 렌더링하므로 훅에서 손대면 화면과 실제가 어긋난다.
- `curl --max-time 4`, 훅 `timeout: 15`, 실패 시 빈 출력으로 조용히 통과 (EX-5)

### SessionStart 훅 stdout 포맷 (Claude Code 규격)
```json
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"<injection>"}}
```
`UserPromptSubmit`은 `"hookEventName":"UserPromptSubmit"` (FR-3.5).

---

## 3. 환경변수 (T1 로컬 / T2 Vercel)

| 이름 | 어디 | 값 |
|---|---|---|
| `TEAMSYNC_API` | 로컬 `.claude/settings.json` `env` | `https://<app>.vercel.app` |
| `TEAMSYNC_PROJECT_ID` | 로컬 | `unithon` |
| `TEAMSYNC_MEMBER` | 로컬 | `A` / `B` / `C` |
| `TEAMSYNC_TOKEN` | 로컬 + Vercel | 공유 시크릿 1개 |
| `TEAMSYNC_DEBUG` | 로컬 (선택) | `1`이면 `\|\| true` 우회 + stderr 로깅 (EX-5) |
| `TEAMSYNC_FORCE` | 로컬 (선택) | `1`이면 길이 필터 무시 (EX-6, 데모 사본) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | **Vercel 전용** | 커밋 금지 (§9.3) |
| `ANTHROPIC_API_KEY` | **Vercel 전용** | 요약 LLM |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + 로컬 | T3 Realtime 구독용 |

**검증된 사실 (16:00 위험검증):** `settings.json`의 `env` 블록은 훅 프로세스 환경까지
그대로 도달한다. `CLAUDE_PROJECT_DIR`도 절대경로로 도달한다.


---

## 4. 진행사항 문서 (비개발자 독자)

`/p/[projectId]/progress`. 개발자가 아닌 팀원이 작업현황을 보는 화면이다.

### 넘지 않는 선 (설계 문서 §4 W · §12)
- **작업을 쪼개지 않는다.** 묶는 축은 `context.branch` — 실제 데이터에 있는 것뿐이다.
- **진행률을 추정하지 않는다.** 상태는 git 머지 여부에서만 나온다.

### 요약 LLM 이 추가로 산출하는 것

| 필드 | 독자 | 규칙 |
|---|---|---|
| `summary` | 동료의 **에이전트** | 한국어 3문장 이내. 파일·함수명 그대로 |
| `summary_plain` | 이 프로젝트의 **비개발자** | 한국어 2문장 이내. 기술 용어 금지. 제품에서 무엇이 바뀌는지 |
| `work_label` | 문서 섹션 제목 | 한국어 20자 이내 명사구. 브랜치명 번역 금지 |

`work_label` 은 사실이 아니라 **명명**이다. 브랜치명이 `fix2` 여도 문서가 읽히게 하는 값이라
넣었고, 그 성격을 알고 쓴다. 같은 브랜치에 여러 개가 쌓이면 **가장 최근 것**을 쓴다.

### 상태 4종 — 전부 사실에서 나온다

| 상태 | 판정 |
|---|---|
| `기준 브랜치` | `main` · `master` · `develop` |
| `머지됨` | `branches.merged = true` (git 이 보고한 값) |
| `진행중` | 머지 전 + 마지막 기록이 24시간 이내 |
| `멈춤` | 머지 전 + 24시간 넘게 기록 없음 |

24시간은 판단이므로 화면에 그 숫자를 그대로 표기한다 (`lib/progress.ts`의 `IDLE_AFTER_HOURS`).

> **알려진 한계:** 기준 브랜치에서 막 딴, 커밋이 하나도 없는 브랜치는 git 정의상 이미
> "머지됨"이다. 그런 브랜치는 `context` 행이 없어 문서에 나타나지 않으므로 실제로는 드러나지 않는다.
