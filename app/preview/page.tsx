import { notFound } from 'next/navigation';
import { TeamSpace } from '@/components/team-space';
import { seedTeamSpace } from '@/lib/seed';

/** 개발 전용 — T2 없이 화면을 만들기 위한 시드 프리뷰. 프로덕션에서는 존재하지 않는다. */
export default function PreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <TeamSpace projectId="preview" data={seedTeamSpace} />;
}
