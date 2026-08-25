import { PrescriptionView } from '@/components/no-meeting/prescription-view';

export const metadata = { title: '회의 처방전 · NO MEETING' };

export default async function PrescriptionPage({
  params,
}: PageProps<'/p/[projectId]/no-meeting/e/[evaluationId]/prescription'>) {
  const { projectId, evaluationId } = await params;
  return <PrescriptionView projectId={projectId} evaluationId={evaluationId} />;
}
