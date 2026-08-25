import { DecisionInbox } from '@/components/decision-inbox';
import { requireMember } from '@/lib/auth-server';
import { getInbox } from '@/lib/queries';

export const metadata = { title: '결정 인박스' };

export default async function InboxPage({ params }: PageProps<'/p/[projectId]/inbox'>) {
  const { projectId } = await params;
  await requireMember(projectId);

  const items = await getInbox(projectId);
  return <DecisionInbox projectId={projectId} items={items} />;
}
