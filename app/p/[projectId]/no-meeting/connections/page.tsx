import { ConnectionsView } from '@/components/no-meeting/connections-view';
import { loadNoMeeting } from '@/lib/no-meeting/queries';

export const metadata = { title: '연결 · NO MEETING' };

export default async function ConnectionsPage({
  params,
}: PageProps<'/p/[projectId]/no-meeting/connections'>) {
  const { projectId } = await params;
  const { connections } = await loadNoMeeting(projectId);
  return <ConnectionsView projectId={projectId} connections={connections} />;
}
