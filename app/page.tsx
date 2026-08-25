import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await currentUser();
  redirect(user ? '/projects' : '/login');
}
