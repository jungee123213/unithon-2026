import { notFound } from 'next/navigation';
import { ProgressDoc } from '@/components/progress-doc';
import { seedProgress } from '@/lib/seed';

export const metadata = { title: '진행사항 (미리보기)' };

export default function PreviewProgressPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <ProgressDoc projectId="preview" sections={seedProgress} />;
}
