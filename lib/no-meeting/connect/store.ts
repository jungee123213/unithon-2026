import 'server-only';
import { serverClient } from '../../supabase';
import type { ConnectorId } from '../types';

/**
 * 커넥터 자격증명 보관 — **서버에서만 읽는다.**
 *
 * `server-only` 를 맨 위에 둔 것은 실수로 클라이언트 컴포넌트가 이 파일을 import
 * 하면 빌드가 깨지게 하기 위해서다. 토큰이 번들에 섞여 나가는 사고는 코드 리뷰로
 * 막는 것보다 빌드로 막는 편이 확실하다.
 *
 * `nm_secrets` 는 `nm_connections` 와 다른 테이블이다. 후자에는 anon select 정책이
 * 걸려 있어 같은 자리에 토큰을 두면 브라우저 키로 읽힌다.
 */

/** 사람 이름 매핑 — 이 축이 죽으면 "부른 사람" 으로 근거를 붙이는 길이 통째로 막힌다. */
export type IdentityMap = Record<string, string>;   // 남의 시스템 이름 → 이 앱의 표시 이름

export type JiraConfig = {
  /** `yourteam.atlassian.net` — 프로토콜 없이 */
  host: string;
  /** 토큰을 발급한 계정. Basic 인증의 사용자 자리다. */
  email: string;
  apiToken: string;
  /** 읽을 프로젝트 키. 비우면 전부 — 그러면 남의 팀 이슈까지 딸려 온다. */
  projectKeys: string[];
  identityMap: IdentityMap;
};

export type SentryConfig = {
  /** `https://sentry.io` 또는 자체 호스팅 주소 */
  baseUrl: string;
  /** 조직 슬러그 */
  org: string;
  /** Internal Integration 토큰. 개인 토큰은 그 사람에게 묶여 팀 커넥터로 맞지 않는다. */
  authToken: string;
  /** 읽을 프로젝트 슬러그 */
  projectSlugs: string[];
  identityMap: IdentityMap;
};

export type ConnectorConfig = { jira: JiraConfig; alerts: SentryConfig };

export async function readConfig<K extends keyof ConnectorConfig>(
  projectId: string, connectorId: K,
): Promise<ConnectorConfig[K] | null> {
  const { data } = await serverClient()
    .from('nm_secrets').select('config')
    .eq('project_id', projectId).eq('connector_id', connectorId).maybeSingle();
  return (data?.config as ConnectorConfig[K]) ?? null;
}

export async function writeConfig(
  projectId: string, connectorId: ConnectorId, config: unknown,
): Promise<void> {
  const { error } = await serverClient().from('nm_secrets').upsert({
    project_id: projectId, connector_id: connectorId,
    config, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`자격증명 저장 실패 — ${error.message}`);
}

export async function deleteConfig(projectId: string, connectorId: ConnectorId): Promise<void> {
  await serverClient().from('nm_secrets').delete()
    .eq('project_id', projectId).eq('connector_id', connectorId);
}

/**
 * 화면에 내보내도 되는 형태로 깎는다. **토큰은 절대 나가지 않는다.**
 * 연결한 사람조차 다시 볼 수 없다 — 바꾸려면 새로 붙여넣는다.
 */
export function publicView(cfg: JiraConfig | null) {
  if (!cfg) return null;
  return {
    host: cfg.host,
    email: cfg.email,
    projectKeys: cfg.projectKeys,
    identityMap: cfg.identityMap ?? {},
    hasToken: !!cfg.apiToken,
  };
}

export function publicViewSentry(cfg: SentryConfig | null) {
  if (!cfg) return null;
  return {
    baseUrl: cfg.baseUrl,
    org: cfg.org,
    projectSlugs: cfg.projectSlugs,
    identityMap: cfg.identityMap ?? {},
    hasToken: !!cfg.authToken,
  };
}
