import { notFound } from 'next/navigation';
import { ProgressDoc } from '@/components/progress-doc';
import { seedProgress } from '@/lib/seed';

export default function PreviewProgressPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <ProgressDoc projectId="preview" sections={seedProgress} preview />;
}
