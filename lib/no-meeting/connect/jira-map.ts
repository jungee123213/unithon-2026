import { BIND_WINDOW_HOURS } from '../settings';
import { extractScopeKeys, mergeScopeKeys, normalizeScopeKey } from '../scope';
import type { Evidence } from '../types';
import type { IdentityMap, JiraConfig } from './store';

/**
 * Jira 응답 → 근거. **순수 변환만 한다 — 네트워크도 비밀도 여기 없다.**
 *
 * `jira.ts` 에서 떼어낸 이유는 하나다: 이 파일은 회귀 확인에서 그대로 돌릴 수 있어야
 * 한다. 셈이 틀리면 게이트가 조용히 거짓 PASS 를 내는데, 그건 실제 Jira 를 붙여
 * 봐야 아는 종류의 버그가 아니다.
 */

export { BIND_WINDOW_HOURS };

type JiraIssue = {
  key: string;
  fields?: {
    summary?: string;
    updated?: string;
    assignee?: { displayName?: string; emailAddress?: string } | null;
    priority?: { name?: string } | null;
    status?: { statusCategory?: { key?: string } } | null;
    labels?: string[];
    components?: { name?: string }[];
    subtasks?: JiraIssue[];
    parent?: { key?: string } | null;
  };
};

const isDone = (i: JiraIssue) => i.fields?.status?.statusCategory?.key === 'done';

/** P1 · Highest · Critical — 조직마다 이름이 다르다. 이 셋만 최우선으로 본다. */
const P1_NAMES = new Set(['p1', 'highest', 'critical', 'blocker']);
const isOpenP1 = (i: JiraIssue) =>
  !isDone(i) && P1_NAMES.has((i.fields?.priority?.name ?? '').trim().toLowerCase());

/**
 * Jira 이름을 이 앱의 표시 이름으로 옮긴다.
 *
 * **이 매핑이 비면 참석자 축이 통째로 죽는다.** 이름이 한 글자만 달라도 근거가
 * 0건이 되고, 화면에는 "근거 없음 → 확인 불가" 로만 보여서 원인을 알 수 없다.
 * 그래서 매핑이 없으면 옮기지 않고 원래 이름을 그대로 둔다 — 우연히 같으면 붙고,
 * 다르면 안 붙는다. 없는 대응을 지어내지 않는다.
 */
const mapPerson = (name: string | undefined, map: IdentityMap): string | undefined =>
  name ? (map?.[name] ?? name) : undefined;

/**
 * 이슈 한 건 = 근거 한 줄.
 *
 * 셈은 두 가지를 서로 다른 칸에 넣는다. 게이트가 다른 것을 묻기 때문이다:
 *   - `taskDone/taskTotal`      — 이 일이 어디까지 됐나 (상태)
 *   - `checklistDone/Total`     — 다음 단계로 갈 선행 조건이 끝났나 (서브태스크)
 *
 * 서브태스크가 없는 이슈는 그 자체가 최소 단위라 1/1 또는 0/1 로 센다. 이건 추정이
 * 아니라 정의다 — 반대로 서브태스크가 없으면 선행 조건 칸은 비운다. 없는 것을 0/0 으로
 * 채우면 "전부 완료" 로 읽혀 Prerequisite 게이트가 거짓 PASS 를 낸다.
 */
function toEvidence(i: JiraIssue, cfg: JiraConfig, projectKey: string): Evidence {
  const subs = i.fields?.subtasks ?? [];
  const subDone = subs.filter(isDone).length;

  const taskTotal = subs.length > 0 ? subs.length : 1;
  const taskDone = subs.length > 0 ? subDone : (isDone(i) ? 1 : 0);

  const scopeKeys = mergeScopeKeys(
    [normalizeScopeKey(i.key), normalizeScopeKey(projectKey)],
    i.fields?.parent?.key ? [normalizeScopeKey(i.fields.parent.key)] : [],
    (i.fields?.labels ?? []).map(normalizeScopeKey),
    (i.fields?.components ?? []).map((c) => normalizeScopeKey(c.name ?? '')),
    extractScopeKeys(i.fields?.summary ?? ''),
  );

  const summaryParts = [`${i.key} ${i.fields?.summary ?? ''}`.trim()];
  summaryParts.push(subs.length > 0
    ? `서브태스크 ${subs.length}건 중 완료 ${subDone}건`
    : isDone(i) ? '완료' : '진행 중');
  if (isOpenP1(i)) summaryParts.push(`${i.fields?.priority?.name} 결함 미해소`);

  return {
    id: `ev-jira-${i.key}`,
    source: 'jira',
    sourceRef: `jira:${i.key}`,
    kind: 'TASK_STATUS',
    summary: summaryParts.join(' · '),
    observedAt: i.fields?.updated ?? new Date().toISOString(),
    facts: {
      taskDone,
      taskTotal,
      ...(subs.length > 0 ? { checklistDone: subDone, checklistTotal: subs.length } : {}),
      openP1: isOpenP1(i) ? 1 : 0,
      owner: mapPerson(i.fields?.assignee?.displayName, cfg.identityMap),
    },
    scopeKeys,
  };
}


/** 이슈 목록을 근거 목록으로. */
export function issuesToEvidence(issues: JiraIssue[], cfg: JiraConfig): Evidence[] {
  return issues.map((i) => toEvidence(i, cfg, i.key.split('-')[0]));
}

export type { JiraIssue };
