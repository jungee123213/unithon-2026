import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { currentUser } from '@/lib/auth-server';

export const metadata = { title: '회원가입' };
export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  if (await currentUser()) redirect('/projects');
  return <AuthForm mode="signup" />;
}
