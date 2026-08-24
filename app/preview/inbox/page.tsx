import { notFound } from 'next/navigation';
import { DecisionInbox } from '@/components/decision-inbox';
import { seedDecisions } from '@/lib/seed';

export const metadata = { title: '결정 인박스 (미리보기)' };

export default function PreviewInboxPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DecisionInbox projectId="preview" decisions={seedDecisions} />;
}
