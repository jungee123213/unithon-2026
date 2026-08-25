import Anthropic from '@anthropic-ai/sdk';
import { redact } from '../redact';
import type { AgendaItem, Evidence, MeetingType } from './types';

const MODEL = process.env.TEAMSYNC_MODEL || 'claude-sonnet-5';

/**
 * 회의 신청서 분류기.
 *
 * 하는 일은 셋뿐이다 — **안건을 쪼개고, 유형 후보에 점수를 매기고, 패턴 라벨을 붙인다.**
 * 하지 않는 일이 더 중요하다:
 *   - 상태·완료 여부·지표를 지어내지 않는다. 그건 커넥터가 준다.
 *   - 확신이 서지 않으면 점수를 벌리지 않는다. 1·2위 차가 0.20 미만이면
 *     엔진이 T8 로 보내 사람에게 되묻는다. 그 되묻기가 이 제품의 기능이다.
 */
const SYSTEM = `당신은 회의 신청서를 읽고 판정 파이프라인에 넘길 구조를 만든다.

신청자는 안건을 줄 단위로 쓰고, 회의가 끝나면 무엇이 나와야 하는지를 한 줄 적었다.
**산출물 문장이 유형 판정의 가장 강한 신호다** — 무엇을 만들려는지가 곧 회의 종류다.
(문서·공유면 T1, 결론·승인이면 T2, 원인·해결책이면 T3, 일정·역할이면 T4)

## 안건 분해
신청자가 쓴 줄을 그대로 안건으로 삼는다. 한 줄에 두 가지가 섞여 있으면 나눈다.
각각을 세 종류 중 하나로 분류한다.

- INFO     — 어딘가에 이미 답이 있고, 확인하면 끝나는 것 ("어디까지 됐나요")
- QUESTION — 답이 아직 없고 누군가 알아봐야 하는 것 ("왜 이런가요")
- DECISION — 데이터로 답이 안 나오고 사람이 골라야 하는 것 ("할까요 말까요")

판단 기준은 "모여야 풀리는가"가 아니라 "답이 어디에 있는가"다.
텍스트에 없는 안건을 만들어내지 마라. 비어 있으면 빈 배열을 반환한다.
신청자가 쓴 표현을 살린다. 다시 쓰지 마라.

## 유형 점수
아래 8종에 0~1 점수를 매긴다. 확신이 없으면 **점수를 벌리지 마라.**
1위와 2위 차가 0.20 미만이면 시스템이 사람에게 목적을 되묻는다. 그게 정상 동작이다.

T1 STATUS 정보 공유 / T2 DECISION 의사결정 / T3 PROBLEM_SOLVING 문제 해결
T4 PLANNING 조율·기획 / T5 BRAINSTORMING / T6 FEEDBACK_1ON1 / T7 CONFLICT_CRISIS 갈등·위기

산출물 문장과 안건이 서로 다른 유형을 가리키면 점수를 벌리지 마라 — 그 경합이 되묻는 이유다.
안건이 비어 있거나 "싱크", "정기 회의" 처럼 내용이 없으면 점수를 벌리지 마라.

## 패턴 라벨
같은 종류의 판단이 반복되는지 세기 위한 라벨. 영문 kebab-case 로 짧게.
결정 안건이 있을 때만 붙인다. 예: minor-release-p1-defect, scope-cut-on-slip
없으면 null.

## 금지
- 진행률·완료율·확률·점수를 본문에서 추정해 만들어내지 마라.
- 신청자가 쓰지 않은 참석자·일정·수치를 만들어내지 마라.`;

const TOOL: Anthropic.Tool = {
  name: 'classify',
  description: '회의 신청서를 안건·유형 후보·패턴 라벨로 분해한다.',
  input_schema: {
    type: 'object',
    properties: {
      agenda: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '안건 한 줄. 신청자 표현을 살린다.' },
            kind: { type: 'string', enum: ['INFO', 'QUESTION', 'DECISION'] },
          },
          required: ['title', 'kind'],
        },
      },
      type_candidates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['STATUS', 'DECISION', 'PROBLEM_SOLVING', 'PLANNING',
                     'BRAINSTORMING', 'FEEDBACK_1ON1', 'CONFLICT_CRISIS'],
            },
            score: { type: 'number' },
          },
          required: ['type', 'score'],
        },
      },
      rationale: { type: 'string', description: '왜 이 점수인지 한 문장.' },
      pattern_key: { type: ['string', 'null'] },
    },
    required: ['agenda', 'type_candidates', 'rationale'],
  },
};

export type Classification = {
  agenda: AgendaItem[];
  typeCandidates: { type: MeetingType; score: number }[];
  typeRationale: string;
  patternKey: string | null;
};

const VALID_TYPES = new Set<MeetingType>([
  'STATUS', 'DECISION', 'PROBLEM_SOLVING', 'PLANNING',
  'BRAINSTORMING', 'FEEDBACK_1ON1', 'CONFLICT_CRISIS',
]);

/** 분류기가 실패해도 판정은 멈추지 않는다 — 유형 미상으로 사람에게 되묻는다. */
export const UNCLASSIFIABLE: Classification = {
  agenda: [],
  typeCandidates: [],
  typeRationale: '신청서만으로는 목적을 가릴 수 없었습니다.',
  patternKey: null,
};

export async function classifyRequest(input: {
  title: string;
  /** 신청자가 줄 단위로 쓴 안건 */
  agendaLines: string[];
  /** 회의가 끝나면 무엇이 나와야 하는가 — 유형 판정의 가장 강한 신호 */
  outcomeText: string;
}): Promise<Classification> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 가 설정되지 않았습니다');

  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'classify' },
    messages: [{
      role: 'user',
      content: [
        `제목: ${redact(input.title).text}`,
        '',
        '안건 (신청자가 쓴 줄 그대로):',
        input.agendaLines.length > 0
          ? input.agendaLines.map((l, i) => `${i + 1}. ${redact(l).text}`).join('\n')
          : '(비어 있음)',
        '',
        `이 회의가 끝나면 나와야 하는 것: ${redact(input.outcomeText).text || '(비어 있음)'}`,
      ].join('\n'),
    }],
  });

  const block = res.content.find((c) => c.type === 'tool_use');
  if (!block || block.type !== 'tool_use') return UNCLASSIFIABLE;

  const out = block.input as {
    agenda?: { title?: string; kind?: string }[];
    type_candidates?: { type?: string; score?: number }[];
    rationale?: string;
    pattern_key?: string | null;
  };

  const agenda: AgendaItem[] = (out.agenda ?? [])
    .filter((a) => a?.title && (a.kind === 'INFO' || a.kind === 'QUESTION' || a.kind === 'DECISION'))
    .map((a, i) => ({
      id: `ag-${i + 1}`,
      title: redact(a.title!).text.slice(0, 120),
      kind: a.kind as AgendaItem['kind'],
      // 근거 연결은 규칙으로 한다. LLM 이 근거 id 를 고르게 하지 않는다.
      evidenceIds: [],
    }));

  const typeCandidates = (out.type_candidates ?? [])
    .filter((c): c is { type: MeetingType; score: number } =>
      !!c?.type && VALID_TYPES.has(c.type as MeetingType) && typeof c.score === 'number')
    .map((c) => ({ type: c.type, score: Math.min(1, Math.max(0, c.score)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return {
    agenda,
    typeCandidates,
    typeRationale: redact(out.rationale ?? '').text.slice(0, 200) || UNCLASSIFIABLE.typeRationale,
    patternKey: typeof out.pattern_key === 'string' && out.pattern_key.trim()
      ? out.pattern_key.trim().slice(0, 60)
      : null,
  };
}

/**
 * 안건에 근거를 붙인다. **LLM 에게 시키지 않는다** — 근거 id 를 고르는 일은
 * 지어내기 쉽고, 틀리면 화면이 "이 근거로 판정했다" 고 거짓말을 하게 된다.
 * 대신 안건 제목과 근거 문장이 실제로 겹치는 단어로만 잇는다.
 */
export function linkEvidence(agenda: AgendaItem[], evidence: Evidence[]): AgendaItem[] {
  const tokenize = (s: string) =>
    new Set(s.toLowerCase().split(/[^a-z0-9가-힣]+/).filter((w) => w.length >= 2));

  return agenda.map((a) => {
    const at = tokenize(a.title);
    const hits = evidence.filter((e) => {
      const et = tokenize(`${e.summary} ${e.sourceRef}`);
      let overlap = 0;
      for (const w of at) if (et.has(w)) overlap += 1;
      return overlap >= 2;
    });
    return { ...a, evidenceIds: hits.map((e) => e.id) };
  });
}
