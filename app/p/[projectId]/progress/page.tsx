import { ProgressDoc } from '@/components/progress-doc';
import { SetupNotice } from '@/components/setup-notice';
import { getProgress } from '@/lib/queries';
import type { ProgressSection } from '@/lib/progress';
import { requireMember } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';
export const metadata = { title: '진행사항' };

export default async function ProgressPage({ params }: PageProps<'/p/[projectId]/progress'>) {
  const { projectId } = await params;

  await requireMember(projectId);
  let sections: ProgressSection[] | null = null;
  let error = '';
  try {
    sections = await getProgress(projectId);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  if (!sections) return <SetupNotice error={error} />;
  return <ProgressDoc projectId={projectId} sections={sections} />;
}
