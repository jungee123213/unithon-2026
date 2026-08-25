import { ConnectionsView } from '@/components/no-meeting/connections-view';

export const metadata = { title: '연결 · NO MEETING' };

export default async function ConnectionsPage({
  params,
}: PageProps<'/p/[projectId]/no-meeting/connections'>) {
  const { projectId } = await params;
  return <ConnectionsView projectId={projectId} />;
}
