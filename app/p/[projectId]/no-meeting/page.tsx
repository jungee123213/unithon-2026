import { NoMeetingToday } from '@/components/no-meeting/today';
import {projectMembers, requireMember } from '@/lib/auth-server';
import { loadNoMeeting } from '@/lib/no-meeting/queries';

export const metadata = { title: 'NO MEETING · 오늘' };

export default async function NoMeetingTodayPage({
  params,
}: PageProps<'/p/[projectId]/no-meeting'>) {
  const { projectId } = await params;
  const m = await requireMember(projectId);

  const [data, members] = await Promise.all([
    loadNoMeeting(projectId),
    projectMembers(projectId),
  ]);
  return (
    <NoMeetingToday
      projectId={projectId}
      member={m.display_name}
      members={members.map((x) => x.display_name)}
      data={data}
    />
  );
}
