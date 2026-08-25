'use server';

import { randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase';
import { currentUser } from '@/lib/auth-server';

export type ProjectState = { error?: string; ok?: string };

/** 사람이 불러줄 수 있는 참여 코드. 헷갈리는 글자(0/O/1/I)는 뺀다. */
function joinCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = randomBytes(6);
  return Array.from(buf, (b) => alphabet[b % alphabet.length]).join('');
}

/** 이 사람 이 프로젝트 전용 훅 토큰. 이 값이 (project_id, member) 를 결정한다. */
const hookToken = () => `tsk_${randomBytes(24).toString('hex')}`;

const slug = (s: string) =>
  s.toLowerCase().trim()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);

export async function createProject(_prev: ProjectState, form: FormData): Promise<ProjectState> {
  const user = await currentUser();
  if (!user) redirect('/login');

  const name = String(form.get('name') ?? '').trim();
  const rawId = String(form.get('project_id') ?? '').trim();
  if (!name) return { error: '프로젝트 이름을 입력해주세요.' };

  const id = slug(rawId || name);
  if (!id) return { error: '프로젝트 ID 로 쓸 수 있는 글자가 없습니다. 영문/숫자로 지어주세요.' };

  const db = serverClient();
  const { data: exists } = await db.from('projects').select('id').eq('id', id).maybeSingle();
  if (exists) return { error: `프로젝트 ID "${id}" 는 이미 쓰이고 있습니다.` };

  const { error } = await db.from('projects').insert({
    id, name, owner_id: user.id, join_code: joinCode(),
  });
  if (error) return { error: '프로젝트를 만들지 못했습니다: ' + error.message };

  const { data: profile } = await db.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
  await db.from('project_members').insert({
    project_id: id, user_id: user.id,
    display_name: profile?.display_name ?? user.email?.split('@')[0] ?? '나',
    hook_token: hookToken(), role: 'owner',
  });

  revalidatePath('/projects');
  redirect(`/projects/${id}`);
}

export async function joinProject(_prev: ProjectState, form: FormData): Promise<ProjectState> {
  const user = await currentUser();
  if (!user) redirect('/login');

  const code = String(form.get('join_code') ?? '').trim().toUpperCase();
  if (!code) return { error: '참여 코드를 입력해주세요.' };

  const db = serverClient();
  const { data: project } = await db.from('projects').select('id, name').eq('join_code', code).maybeSingle();
  if (!project) return { error: '그런 참여 코드가 없습니다. 다시 확인해주세요.' };

  const { data: already } = await db.from('project_members')
    .select('project_id').eq('project_id', project.id).eq('user_id', user.id).maybeSingle();
  if (already) {
    revalidatePath('/projects');
    redirect(`/projects/${project.id}`);
  }

  const { data: profile } = await db.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
  const { error } = await db.from('project_members').insert({
    project_id: project.id, user_id: user.id,
    display_name: profile?.display_name ?? user.email?.split('@')[0] ?? '나',
    hook_token: hookToken(), role: 'member',
  });
  if (error) return { error: '참여하지 못했습니다: ' + error.message };

  revalidatePath('/projects');
  redirect(`/projects/${project.id}`);
}

/** 토큰이 유출됐을 때. 재발급하면 그 사람은 훅을 다시 설치해야 한다. */
export async function rotateToken(projectId: string) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const db = serverClient();
  await db.from('project_members').update({ hook_token: hookToken() })
    .eq('project_id', projectId).eq('user_id', user.id);
  revalidatePath(`/projects/${projectId}`);
}

