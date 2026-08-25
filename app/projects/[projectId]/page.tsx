import { notFound, redirect } from 'next/navigation';
import { ProjectDetailView, type ProjectDetail } from '@/components/project-detail';
import { currentUser, membershipOf } from '@/lib/auth-server';
import { serverClient } from '@/lib/supabase';

export const metadata = { title: '프로젝트 설정' };
export const dynamic = 'force-dynamic';

export default async function ProjectPage({ params }: PageProps<'/projects/[projectId]'>) {
  const { projectId } = await params;
  const user = await currentUser();
  if (!user) redirect('/login');

  const me = await membershipOf(user.id, projectId);
  if (!me) notFound();

  const db = serverClient();
  const [{ data: project }, { data: members }] = await Promise.all([
    db.from('projects').select('id, name, join_code').eq('id', projectId).maybeSingle(),
    db.from('project_members').select('display_name, role, joined_at')
      .eq('project_id', projectId).order('joined_at', { ascending: true }),
  ]);
  if (!project) notFound();

  const detail: ProjectDetail = {
    id: project.id,
    name: project.name,
    joinCode: project.join_code,
    myName: me.display_name,
    myToken: me.hook_token,
    role: me.role,
    members: members ?? [],
    appUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://teamsync-ruddy.vercel.app',
  };

  return <ProjectDetailView p={detail} />;
}
