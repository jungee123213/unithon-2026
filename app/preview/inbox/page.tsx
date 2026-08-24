import { notFound } from 'next/navigation';
import { DecisionInbox } from '@/components/decision-inbox';
import { seedDecisions } from '@/lib/seed';

export default function PreviewInboxPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DecisionInbox projectId="preview" decisions={seedDecisions} />;
}
