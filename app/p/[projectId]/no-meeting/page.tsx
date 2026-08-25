import { redirect } from 'next/navigation';
import { NoMeetingToday } from '@/components/no-meeting/today';
import { currentUser, membershipOf } from '@/lib/auth-server';
import { loadNoMeeting } from '@/lib/no-meeting/queries';

export const metadata = { title: 'NO MEETING · 오늘' };

export default async function NoMeetingTodayPage({
  params,
}: PageProps<'/p/[projectId]/no-meeting'>) {
  const { projectId } = await params;
  const user = await currentUser();
  if (!user) redirect('/login');
  const m = await membershipOf(user.id, projectId);
  if (!m) redirect('/projects');

  const data = await loadNoMeeting(projectId);
  return <NoMeetingToday projectId={projectId} member={m.display_name} data={data} />;
}
