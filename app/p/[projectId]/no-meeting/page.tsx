import { NoMeetingToday } from '@/components/no-meeting/today';

export const metadata = { title: 'NO MEETING · 오늘' };

export default async function NoMeetingTodayPage({
  params,
}: PageProps<'/p/[projectId]/no-meeting'>) {
  const { projectId } = await params;
  return <NoMeetingToday projectId={projectId} />;
}
