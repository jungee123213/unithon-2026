import { Suspense } from 'react';
import { EvaluationDetail } from '@/components/no-meeting/evaluation-detail';
import { loadEvaluation } from '@/lib/no-meeting/queries';
import { requireMember } from '@/lib/auth-server';

export const metadata = { title: '판정 상세 · NO MEETING' };

export default async function EvaluationDetailPage({
  params,
}: PageProps<'/p/[projectId]/no-meeting/e/[evaluationId]'>) {
  const { projectId, evaluationId } = await params;
  await requireMember(projectId);
  const ev = await loadEvaluation(projectId, evaluationId);
  // useSearchParams(?fresh=1) 를 쓰므로 Suspense 경계가 필요하다.
  return (
    <Suspense fallback={null}>
      <EvaluationDetail projectId={projectId} ev={ev} />
    </Suspense>
  );
}
