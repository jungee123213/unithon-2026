import Anthropic from '@anthropic-ai/sdk';
import type { IngestTurn, SummaryResult } from './types';
import { redact } from './redact';

const MODEL = process.env.TEAMSYNC_MODEL || 'claude-sonnet-5';

/**
 * FR-4.1 · 요약과 "사람 결정이 필요한 항목"을 단일 호출로 산출한다.
 * §5.1 L3 · 팀 관련성 판정과 민감정보 제외를 같은 호출에서 동시에 수행한다.
 *
 * 필수 문구는 설계 문서에 고정되어 있다. 바꾸면 §5 재현 가능성이 깨진다.
 */
const SYSTEM = `당신은 개발 팀의 에이전트 세션 로그를 읽고, 동료의 에이전트에게 넘길 요약을 만든다.

이 세션이 팀 동료의 작업에 영향을 주지 않으면 {"skip": true}만 반환하라.
자격증명·API 키·토큰·개인정보는 요약에 절대 포함하지 마라.

팀에 영향을 주는 것의 예: 공유 인터페이스/스키마/API 변경, 공용 모듈 리팩터링,
의존성 추가·제거, 규약 변경, 다른 사람의 작업을 깨뜨리거나 전제를 바꾸는 모든 것.

영향을 주지 않는 것의 예: 혼자 읽기만 한 탐색, 로컬 실험, 문서 오타 수정,
질문과 답변만 오간 세션, 이 프로젝트와 무관한 작업.

요약은 독자가 다른 두 벌을 만든다.

summary — 독자는 동료의 **에이전트**다.
- 한국어. 3문장 이내. 읽고 바로 행동을 바꿀 수 있게 쓴다.
- "무엇이 어떻게 바뀌었는가"를 쓴다. "무엇을 했다"가 아니라.
- 파일·함수·엔드포인트 이름은 그대로 적는다.

summary_plain — 독자는 이 프로젝트의 **비개발자**(기획·디자인·PM)다.
- 한국어. 2문장 이내. 코드를 모르는 사람이 작업현황을 파악하는 것이 목적이다.
- 파일명·함수명·타입명·라이브러리명을 쓰지 않는다. 그 변경이 **제품에서 무엇을 바꾸는지**를 쓴다.
- 바깥에서 보이는 변화가 없는 작업이면 그렇게 쓴다. 억지로 사용자 가치를 지어내지 마라.
- 진행률·완료 비율·남은 기간을 추정하지 마라. 모르는 값이다.

work_label — 이 브랜치에서 하는 일이 무엇인지 한 줄.
- 한국어 20자 이내. 명사구로. 예: "결제 재시도 로직", "영수증 화면", "훅 수집 경로".
- 브랜치명을 번역하지 마라. 세션 내용을 보고 무슨 작업인지 쓴다.
- 브랜치명이 이미 충분히 설명적이면 그대로 다시 쓰지 말고 내용 기준으로 쓴다.

decisions 규칙 (FR-4.2, 4.3):
- 사람의 가치판단이 필요한 것만 올린다. 사실 확인·계산·정책 조회는 올리지 않는다 — 그건 이미 답이 있다.
- 없으면 빈 배열. 대부분의 세션은 빈 배열이 정상이다.
- 올린다면 선택지 2개와 각각의 근거를 붙인다. 30초 안에 판단 가능해야 한다.`;

const TOOL = {
  name: 'report',
  description: '세션 요약과 사람 결정이 필요한 항목을 보고한다',
  input_schema: {
    type: 'object' as const,
    properties: {
      skip: { type: 'boolean', description: '팀 동료의 작업에 영향을 주지 않으면 true' },
      summary: { type: 'string', description: 'skip 이 false 일 때만. 동료 에이전트용. 한국어 3문장 이내' },
      summary_plain: { type: 'string', description: 'skip 이 false 일 때만. 비개발자용. 한국어 2문장 이내, 기술 용어 금지' },
      work_label: { type: 'string', description: '이 브랜치에서 하는 일. 한국어 20자 이내 명사구' },
      decisions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: { label: { type: 'string' }, rationale: { type: 'string' } },
                required: ['label', 'rationale'],
              },
            },
          },
          required: ['question', 'options'],
        },
      },
    },
    required: ['skip'],
  },
};

export async function summarize(turns: IngestTurn[], branch: string): Promise<SummaryResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 가 설정되지 않았습니다');

  // 입력 단계에서 먼저 마스킹한다 — 모델에게 시크릿을 보여줄 이유가 없다.
  const transcript = turns.map((t) => redact(t.text).text).join('\n\n---\n\n');

  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'report' },
    messages: [
      {
        role: 'user',
        content: `브랜치: ${branch}\n\n에이전트가 남긴 턴 ${turns.length}개:\n\n${transcript}`,
      },
    ],
  });

  const block = res.content.find((c) => c.type === 'tool_use');
  if (!block || block.type !== 'tool_use') return { skip: true };

  const out = block.input as {
    skip?: boolean;
    summary?: string;
    summary_plain?: string;
    work_label?: string;
    decisions?: { question?: string; options?: { label?: string; rationale?: string }[] }[];
  };
  if (out.skip === true || !out.summary) return { skip: true };

  // 출력 단계에서 한 번 더 마스킹한다 — 프롬프트는 확률적이고 이건 결정론적이다 (§5.1)
  const summary = redact(out.summary).text;
  const summaryPlain = redact(out.summary_plain || out.summary).text;
  const workLabel = redact(out.work_label || '').text.slice(0, 40);

  const decisions = (out.decisions ?? [])
    .filter((d) => d?.question && Array.isArray(d.options) && d.options.length > 0)
    .map((d) => ({
      question: redact(d.question!).text,
      options: d.options!.map((o) => ({
        label: redact(o.label ?? '').text,
        rationale: redact(o.rationale ?? '').text,
      })),
    }));

  return { skip: false, summary, summaryPlain, workLabel, decisions };
}
