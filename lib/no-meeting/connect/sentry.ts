import 'server-only';
import { BIND_WINDOW_HOURS } from '../settings';
import { issuesToEvidence, type SentryIssue } from './sentry-map';
import type { Evidence } from '../types';
import type { SentryConfig } from './store';

/**
 * 장애 알림 커넥터 — `symptom_measured` 조건 하나를 연다.
 *
 * Jira 와 같은 틀이다: 저장 전에 실제로 읽히는지 확인하고, 실패는 조용히 0건으로
 * 떨어뜨린다(근거가 없으면 UNKNOWN 이고, UNKNOWN 이면 회의를 삭제하지 않으므로
 * 실패의 방향이 안전한 쪽이다).
 *
 * 토큰은 Sentry 의 **Internal Integration** 토큰을 쓴다. 개인 Auth Token 은 그 사람에게
 * 묶여서 팀 커넥터로는 맞지 않는다 — 화면에서도 그렇게 안내한다.
 */

const API_TIMEOUT_MS = 8_000;

async function sentryFetch(cfg: SentryConfig, path: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}${path}`, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${cfg.authToken}`, Accept: 'application/json' },
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

export type SentryVerifyResult =
  | { ok: true; orgLabel: string; projects: { slug: string; name: string }[]; people: string[] }
  | { ok: false; error: string };

export async function verifySentry(cfg: SentryConfig): Promise<SentryVerifyResult> {
  try {
    const res = await sentryFetch(cfg, `/api/0/organizations/${encodeURIComponent(cfg.org)}/projects/`);
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: '토큰이 맞지 않거나 이 조직을 읽을 권한이 없습니다.' };
    }
    if (res.status === 404) {
      return { ok: false, error: `조직 "${cfg.org}" 을 찾지 못했습니다. 슬러그를 확인해주세요.` };
    }
    if (!res.ok) return { ok: false, error: `Sentry 가 ${res.status} 를 돌려줬습니다.` };

    const list = await res.json() as { slug: string; name: string }[];
    if (!Array.isArray(list) || list.length === 0) {
      return { ok: false, error: '읽을 수 있는 프로젝트가 없습니다. 토큰 범위를 확인해주세요.' };
    }

    const slugs = cfg.projectSlugs.length > 0 ? cfg.projectSlugs : list.map((p) => p.slug);
    const people = await assigneeNames(cfg, slugs);

    return {
      ok: true,
      orgLabel: cfg.org,
      projects: list.map((p) => ({ slug: p.slug, name: p.name })),
      people,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error && e.name === 'AbortError'
        ? 'Sentry 가 제때 응답하지 않았습니다.'
        : 'Sentry 에 닿지 못했습니다. 주소를 확인해주세요.',
    };
  }
}

async function assigneeNames(cfg: SentryConfig, slugs: string[]): Promise<string[]> {
  const names = new Set<string>();
  for (const slug of slugs.slice(0, 5)) {
    const issues = await fetchIssues(cfg, slug).catch(() => []);
    for (const i of issues) if (i.assignedTo?.name) names.add(i.assignedTo.name);
  }
  return [...names];
}

/**
 * 미해결 이슈만, 시간 창 안의 것만 읽는다.
 * 이미 해결된 이슈는 "증상이 지금 계측되고 있다" 의 근거가 아니다.
 */
async function fetchIssues(cfg: SentryConfig, slug: string): Promise<SentryIssue[]> {
  const query = `is:unresolved lastSeen:-${Math.round(BIND_WINDOW_HOURS)}h`;
  const res = await sentryFetch(
    cfg,
    `/api/0/projects/${encodeURIComponent(cfg.org)}/${encodeURIComponent(slug)}/issues/`
      + `?query=${encodeURIComponent(query)}&statsPeriod=24h&limit=25`,
  );
  if (!res.ok) throw new Error(`Sentry 조회 실패 (${res.status})`);
  const json = await res.json() as SentryIssue[];
  return Array.isArray(json) ? json.map((i) => ({ ...i, project: i.project ?? { slug } })) : [];
}

export async function loadSentryEvidence(cfg: SentryConfig): Promise<Evidence[]> {
  const slugs = cfg.projectSlugs ?? [];
  if (slugs.length === 0) return [];

  const perProject = await Promise.all(
    slugs.slice(0, 10).map((s) => fetchIssues(cfg, s).catch(() => [] as SentryIssue[])),
  );
  return issuesToEvidence(perProject.flat(), cfg.identityMap ?? {});
}
