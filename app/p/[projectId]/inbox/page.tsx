import { DecisionInbox } from '@/components/decision-inbox';
import { SetupNotice } from '@/components/setup-notice';
import { getDecisions } from '@/lib/queries';
import type { DecisionRow } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: '결정 인박스' };

export default async function InboxPage({ params }: PageProps<'/p/[projectId]/inbox'>) {
  const { projectId } = await params;

  let decisions: DecisionRow[] | null = null;
  let error = '';
  try {
    decisions = await getDecisions(projectId);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  if (!decisions) return <SetupNotice error={error} />;
  return <DecisionInbox projectId={projectId} decisions={decisions} />;
}
