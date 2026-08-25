import { PrescriptionView } from '@/components/no-meeting/prescription-view';
import { loadEvaluation } from '@/lib/no-meeting/queries';

export const metadata = { title: '회의 처방전 · NO MEETING' };

export default async function PrescriptionPage({
  params,
}: PageProps<'/p/[projectId]/no-meeting/e/[evaluationId]/prescription'>) {
  const { projectId, evaluationId } = await params;
  const ev = await loadEvaluation(projectId, evaluationId);
  return <PrescriptionView projectId={projectId} ev={ev} />;
}
