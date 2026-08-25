import { redirect } from 'next/navigation';
import { ProjectList } from '@/components/project-list';
import { currentUser, myProjects } from '@/lib/auth-server';
import { serverClient } from '@/lib/supabase';

export const metadata = { title: '프로젝트' };
export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const user = await currentUser();
  if (!user) redirect('/login');

  const projects = await myProjects(user.id);
  const { data: profile } = await serverClient()
    .from('profiles').select('display_name').eq('id', user.id).maybeSingle();

  return <ProjectList projects={projects} name={profile?.display_name ?? user.email ?? ''} />;
}
