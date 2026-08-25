import { ConnectionsView } from '@/components/no-meeting/connections-view';
import type { ConnectorPublic } from '@/components/no-meeting/connector-connect';
import { projectMembers, requireMember } from '@/lib/auth-server';
import { readConfig } from '@/lib/no-meeting/connect/store';
import { loadNoMeeting } from '@/lib/no-meeting/queries';
import type { ConnectorId } from '@/lib/no-meeting/types';

export const metadata = { title: '연결 · NO MEETING' };

export default async function ConnectionsPage({
  params,
}: PageProps<'/p/[projectId]/no-meeting/connections'>) {
  const { projectId } = await params;
  await requireMember(projectId);
  const [{ connections }, jira, alerts, members] = await Promise.all([
    loadNoMeeting(projectId),
    readConfig(projectId, 'jira'),
    readConfig(projectId, 'alerts'),
    projectMembers(projectId),
  ]);

  // **토큰은 여기서 걸러진다.** 아래 객체에 담기는 것만 클라이언트로 나간다.
  const configs: Partial<Record<ConnectorId, ConnectorPublic>> = {
    jira: jira && {
      identityMap: jira.identityMap ?? {},
      hasToken: !!jira.apiToken,
      defaults: { host: jira.host, email: jira.email, projects: jira.projectKeys.join(' ') },
    },
    alerts: alerts && {
      identityMap: alerts.identityMap ?? {},
      hasToken: !!alerts.authToken,
      defaults: { base_url: alerts.baseUrl, org: alerts.org, projects: alerts.projectSlugs.join(' ') },
    },
  };

  return (
    <ConnectionsView
      projectId={projectId}
      connections={connections}
      configs={configs}
      members={members.map((m) => m.display_name)}
    />
  );
}
