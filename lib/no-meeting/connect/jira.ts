import 'server-only';
import { BIND_WINDOW_HOURS } from '../settings';
import { issuesToEvidence, type JiraIssue } from './jira-map';
import type { Evidence } from '../types';
import type { JiraConfig } from './store';

/**
 * 이슈트래커 커넥터 — **셀 수 있는 상태가 오는 유일한 곳.**
 *
 * 세션 요약(teamsync)은 "무엇을 했는가" 라서 Task 단위로 셀 수 없다. 그래서
 * `source_of_truth_exists` · `no_ambiguity` · `prerequisites_complete` 세 조건은
 * 여기가 붙기 전까지 영영 열리지 않는다. 이 파일이 T1 의 DELETE 와 T2 의 DECIDE 를 연다.
 *
 * 지키는 경계는 `evidence-teamsync.ts` 와 같다:
 *   - 문장을 파싱해 숫자를 만들지 않는다. 숫자는 Jira 가 준 필드에서만 나온다.
 *   - 셀 수 없으면 `taskDone/taskTotal` 을 비운다. 파생 계층이 "모호" 로 센다.
 *   - 없는 값을 0 으로 채우지 않는다. 0 과 모름은 다른 값이다.
 */

const API_TIMEOUT_MS = 8_000;

function authHeader(cfg: JiraConfig) {
  return `Basic ${Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString('base64')}`;
}

async function jiraFetch(cfg: JiraConfig, path: string, init?: RequestInit) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(`https://${cfg.host}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        ...init?.headers,
        Authorization: authHeader(cfg),
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ── 연결 확인 ─────────────────────────────────────────────────────
/**
 * 붙여넣은 값으로 실제로 읽히는지 확인한다.
 *
 * 저장하기 전에 부른다. 안 되는 값을 CONNECTED 로 저장하면 화면은 연결됐다고 하고
 * 판정은 근거 없이 UNKNOWN 을 내는데, 그게 이 제품에서 제일 나쁜 상태다 —
 * 사람은 시스템이 봤다고 믿고 있는데 실제로는 아무것도 안 봤다.
 */
export type VerifyResult =
  | { ok: true; accountLabel: string; projects: { key: string; name: string }[]; people: string[] }
  | { ok: false; error: string };

export async function verifyJira(cfg: JiraConfig): Promise<VerifyResult> {
  try {
    const me = await jiraFetch(cfg, '/rest/api/3/myself');
    if (me.status === 401 || me.status === 403) {
      return { ok: false, error: '이메일 또는 API 토큰이 맞지 않습니다.' };
    }
    if (!me.ok) return { ok: false, error: `Jira 가 ${me.status} 를 돌려줬습니다.` };
    const meJson = await me.json() as { displayName?: string; emailAddress?: string };

    const projRes = await jiraFetch(cfg, '/rest/api/3/project/search?maxResults=50');
    const projJson = projRes.ok
      ? await projRes.json() as { values?: { key: string; name: string }[] }
      : { values: [] };
    const projects = (projJson.values ?? []).map((p) => ({ key: p.key, name: p.name }));

    if (projects.length === 0) {
      return { ok: false, error: '읽을 수 있는 프로젝트가 없습니다. 이 계정의 권한을 확인해주세요.' };
    }

    // 사람 매핑 화면에 채울 후보 — 이 프로젝트들에서 실제로 담당자로 잡히는 이름들.
    const people = await assigneeNames(cfg, projects.map((p) => p.key));

    return {
      ok: true,
      accountLabel: meJson.displayName || meJson.emailAddress || cfg.email,
      projects,
      people,
    };
  } catch (e) {
    const msg = e instanceof Error && e.name === 'AbortError'
      ? 'Jira 가 제때 응답하지 않았습니다.'
      : 'Jira 에 닿지 못했습니다. 도메인을 확인해주세요.';
    return { ok: false, error: msg };
  }
}

/** 최근 이슈에서 담당자 이름을 모은다. 사람 매핑 화면의 왼쪽 열이 된다. */
async function assigneeNames(cfg: JiraConfig, keys: string[]): Promise<string[]> {
  if (keys.length === 0) return [];
  const jql = `project in (${keys.slice(0, 20).map((k) => `"${k}"`).join(',')}) AND assignee is not EMPTY ORDER BY updated DESC`;
  const res = await jiraFetch(
    cfg,
    `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=100&fields=assignee`,
  );
  if (!res.ok) return [];
  const json = await res.json() as { issues?: JiraIssue[] };
  const names = new Set<string>();
  for (const i of json.issues ?? []) {
    const n = i.fields?.assignee?.displayName;
    if (n) names.add(n);
  }
  return [...names];
}

// ── 근거 ──────────────────────────────────────────────────────────

const FIELDS = 'summary,updated,assignee,priority,status,labels,components,subtasks,parent';

/**
 * 붙일 근거를 읽어 온다.
 *
 * 시간 창을 `BIND_WINDOW_HOURS` 로 잘라 온다. 어차피 그보다 오래된 사실은
 * 참석자 축에서 안 붙고, 전부 끌어오면 스코프 축에서 오래된 이슈가 딸려 들어와
 * 최신성 조건만 떨어뜨린다.
 */
export async function loadJiraEvidence(cfg: JiraConfig): Promise<Evidence[]> {
  const keys = cfg.projectKeys ?? [];
  if (keys.length === 0) return [];

  const jql = [
    `project in (${keys.slice(0, 20).map((k) => `"${k}"`).join(',')})`,
    `updated >= -${Math.round(BIND_WINDOW_HOURS)}h`,
    'ORDER BY updated DESC',
  ].join(' AND ').replace(' AND ORDER BY', ' ORDER BY');

  const res = await jiraFetch(
    cfg,
    `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=100&fields=${FIELDS}`,
  );
  if (!res.ok) throw new Error(`Jira 조회 실패 (${res.status})`);

  const json = await res.json() as { issues?: JiraIssue[] };
  return issuesToEvidence(json.issues ?? [], cfg);
}
