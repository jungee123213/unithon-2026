import { redirect } from 'next/navigation';
import { DecisionInbox } from '@/components/decision-inbox';
import { currentUser, membershipOf } from '@/lib/auth-server';
import { getInbox } from '@/lib/queries';

export const metadata = { title: '결정 인박스' };

export default async function InboxPage({ params }: PageProps<'/p/[projectId]/inbox'>) {
  const { projectId } = await params;
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!(await membershipOf(user.id, projectId))) redirect('/projects');

  const items = await getInbox(projectId);
  return <DecisionInbox projectId={projectId} items={items} />;
}
