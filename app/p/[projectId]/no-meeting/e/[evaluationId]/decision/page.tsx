import { DecisionCardView } from '@/components/no-meeting/decision-card-view';
import { loadEvaluation, loadNoMeeting } from '@/lib/no-meeting/queries';

export const metadata = { title: '결정 카드 · NO MEETING' };

export default async function DecisionPage({
  params,
}: PageProps<'/p/[projectId]/no-meeting/e/[evaluationId]/decision'>) {
  const { projectId, evaluationId } = await params;
  const [ev, data] = await Promise.all([
    loadEvaluation(projectId, evaluationId),
    loadNoMeeting(projectId),
  ]);
  const candidate = ev?.patternKey
    ? data.candidates.find((c) => c.patternKey === ev.patternKey) ?? null
    : null;
  return <DecisionCardView projectId={projectId} ev={ev} candidate={candidate} />;
}
