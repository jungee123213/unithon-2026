import { redirect } from 'next/navigation';
import { Landing } from '@/components/landing';
import { currentUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await currentUser();
  if (user) redirect('/projects');
  return <Landing />;
}
