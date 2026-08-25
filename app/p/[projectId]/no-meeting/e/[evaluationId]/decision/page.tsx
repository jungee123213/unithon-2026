import { DecisionCardView } from '@/components/no-meeting/decision-card-view';

export const metadata = { title: '결정 카드 · NO MEETING' };

export default async function DecisionPage({
  params,
}: PageProps<'/p/[projectId]/no-meeting/e/[evaluationId]/decision'>) {
  const { projectId, evaluationId } = await params;
  return <DecisionCardView projectId={projectId} evaluationId={evaluationId} />;
}
