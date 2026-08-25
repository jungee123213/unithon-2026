import type { TeamSpaceData } from './queries';
import { renderInjection } from './injection';
import { groupProgress } from './progress';
import type { ContextRow } from './types';

/**
 * T3 가 T2·Supabase 없이 화면을 만들 수 있게 하는 시드 (§9.2 "이후 서로를 기다리지 않는다").
 * 계약(lib/types.ts)과 같은 모양이므로, 여기서 잘 보이면 실제 데이터에서도 잘 보인다.
 */
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

/** 브랜치별 한 줄 설명 — 요약 LLM 이 세션 내용을 보고 붙인 이름 */
const LABEL: Record<string, string> = {
  'main': '공유 기반 정리',
  'develop': '인프라 구축',
  'feature/receipt': '영수증 화면',
  'feature/ingest': '수집 API',
  'feature/hooks': '훅 수집 경로',
  'feature/decision-inbox': '결정 인박스',
};

const row = (
  id: number, member: string, branch: string, minsAgo: number,
  summary: string, summary_plain: string,
): ContextRow => ({
  id, project_id: 'preview', member, branch, summary, summary_plain,
  work_label: LABEL[branch] ?? null,
  session_id: `s-${id}`, created_at: ago(minsAgo),
});

// ── 세션 원본 ────────────────────────────────────────────────────
// summary       = 동료 에이전트가 읽고 행동을 바꾸도록 쓴 문장
// summary_plain = 비개발자가 작업현황을 알도록 쓴 문장
const ROWS: ContextRow[] = [
  row(11, 'A', 'main', 4,
    'auth/middleware.ts 의 requireUser() 가 Promise<User> 대신 Result<User, AuthError> 를 반환합니다. 호출부는 result.ok 를 검사해야 합니다.',
    '로그인 확인 방식을 바꿨습니다. 로그인에 실패했을 때 화면이 그냥 멈추지 않고 이유를 알려줄 수 있게 됩니다.'),
  row(10, 'C', 'main', 96,
    'flush.sh 의 detach 를 setsid 에서 perl fork+setsid 로 교체했습니다. macOS 에 setsid 가 없어 기존 코드는 조용히 아무것도 하지 않고 있었습니다.',
    '맥에서 작업 기록이 전송되지 않던 문제를 고쳤습니다. 에러도 안 뜨고 조용히 실패하고 있었습니다.'),
  row(9, 'A', 'main', 210,
    'settings.json 의 env 블록이 훅 프로세스까지 도달하는 것을 확인했습니다. 설정은 전부 여기로 모읍니다.',
    '팀원별 설정(누구인지, 어느 프로젝트인지)을 한 파일에서 관리할 수 있는지 확인했고, 됩니다.'),

  row(8, 'B', 'feature/receipt', 22,
    'injections 테이블에 batch_id·rendered 컬럼을 추가했습니다. 주입 문자열을 그대로 보관하므로 영수증 뷰가 재렌더 없이 원문을 그립니다.',
    '동료에게 실제로 전달된 문장을 화면에 그대로 보여줄 수 있게 저장 구조를 바꿨습니다.'),
  row(7, 'B', 'feature/receipt', 74,
    '영수증 뷰의 폰트를 IBM Plex Mono 로 바꾸고 본문을 18px 로 올렸습니다.',
    '발표용으로 글씨를 키우고 서체를 바꿨습니다. 프로젝터에서 뒷줄까지 읽힙니다.'),
  row(6, 'C', 'feature/receipt', 132,
    'Team Space 를 2단으로 나눴습니다. 왼쪽이 영수증, 오른쪽이 카운터와 세션 카드입니다.',
    '메인 화면을 좌우 2단으로 나눴습니다. 왼쪽이 전달된 내용, 오른쪽이 숫자 요약입니다.'),

  row(5, 'C', 'feature/ingest', 400,
    '/api/ingest 에 session_id 멱등키를 걸었습니다. 재전송이 와도 LLM 을 다시 부르지 않습니다.',
    '같은 작업 기록이 두 번 들어와도 중복으로 쌓이지 않게 했습니다. 비용도 두 번 안 나갑니다.'),
  row(4, 'A', 'feature/ingest', 520,
    '요약 프롬프트에 팀 관련성 판정과 민감정보 제외를 한 호출로 합쳤습니다. 사후 정규식 필터도 붙였습니다.',
    '팀과 상관없는 작업은 아예 공유되지 않게, 비밀번호·키 같은 건 요약에서 지워지게 했습니다.'),

  row(3, 'B', 'develop', 300,
    'Supabase 서울 리전에 테이블 3개와 Realtime publication 을 올렸습니다.',
    '데이터베이스를 서울 서버에 만들었습니다. 새 내용이 들어오면 화면이 자동으로 갱신됩니다.'),

  row(1, 'A', 'feature/decision-inbox', 3200,
    'decisions 테이블 producer 를 붙이다 중단했습니다. 요약 LLM 이 decisions 를 뱉지만 인박스 UI 와 연결하지 않았습니다.',
    '결정 인박스 기능을 만들다 멈췄습니다. 뒷단은 됐고 화면 연결이 남았습니다.'),

  row(2, 'C', 'feature/hooks', 610,
    'Stop 훅에서 last_assistant_message 를 누적하도록 바꿨습니다. 트랜스크립트 파일은 비동기라 마지막 턴이 빠집니다.',
    '작업 내용을 빠짐없이 모으도록 수집 방식을 바꿨습니다. 마지막에 한 일이 누락되던 문제입니다.'),
];

/** git branch --merged 로 확인된 사실. 추정이 아니다. */
const MERGED = ['feature/ingest', 'feature/hooks'];

export const seedProgress = groupProgress(ROWS, { merged: MERGED });

// ── Team Space 시드 ─────────────────────────────────────────────
const S1 = ROWS[0], S2 = ROWS[3], S3 = ROWS[1];

const receipt = (member: string, items: ContextRow[], minsAgo: number) => {
  const at = new Date(Date.now() - minsAgo * 60_000);
  const { injection } = renderInjection(
    items.map((c) => ({ context_id: c.id, member: c.member, summary: c.summary, created_at: c.created_at })),
    '한끼',
    at,
  );
  return { batch_id: `b-${member}-${minsAgo}`, member, rendered: injection, injected_at: at.toISOString(), items: items.length };
};

export const seedTeamSpace: TeamSpaceData = {
  sessions: [
    { ...S1, consumers: ['B', 'C'] },
    { ...S2, consumers: ['A'] },
    { ...S3, consumers: [] },
  ],
  receipts: [receipt('B', [S1], 3), receipt('A', [S2, S3], 20)],
  counters: {
    tier1: { contexts: ROWS.length, crossMember: 4, avgSecondsToFirstUse: 47 },
    tier2: { humanRelayed: 0, humanEdited: 0 },
  },
  openDecisions: 1,
};

