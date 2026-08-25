import { LedgerView } from '@/components/no-meeting/ledger-view';
import { loadNoMeeting } from '@/lib/no-meeting/queries';
import { requireMember } from '@/lib/auth-server';

export const metadata = { title: '결정 원장 · NO MEETING' };

export default async function LedgerPage({
  params,
}: PageProps<'/p/[projectId]/no-meeting/ledger'>) {
  const { projectId } = await params;
  await requireMember(projectId);
  const data = await loadNoMeeting(projectId);
  return <LedgerView projectId={projectId} data={data} />;
}
