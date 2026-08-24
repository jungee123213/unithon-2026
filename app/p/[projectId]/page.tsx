import { TeamSpace } from '@/components/team-space';
import { SetupNotice } from '@/components/setup-notice';
import { getTeamSpace, type TeamSpaceData } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function TeamSpacePage({ params }: PageProps<'/p/[projectId]'>) {
  const { projectId } = await params;

  // 환경변수 미설정이나 스키마 미적용에서 흰 화면이 뜨면 무대에서 원인을 못 찾는다
  let data: TeamSpaceData | null = null;
  let error = '';
  try {
    data = await getTeamSpace(projectId);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  if (!data) return <SetupNotice error={error} />;
  return <TeamSpace projectId={projectId} data={data} />;
}
