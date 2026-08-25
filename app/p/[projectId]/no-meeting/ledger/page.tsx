import { LedgerView } from '@/components/no-meeting/ledger-view';

export const metadata = { title: '결정 원장 · NO MEETING' };

export default async function LedgerPage({
  params,
}: PageProps<'/p/[projectId]/no-meeting/ledger'>) {
  const { projectId } = await params;
  return <LedgerView projectId={projectId} />;
}
