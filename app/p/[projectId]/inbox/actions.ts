'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { currentUser, membershipOf } from '@/lib/auth-server';
import { serverClient } from '@/lib/supabase';

/**
 * 훅이 뽑은 결정을 닫는다.
 * 회의 판정에서 온 결정 카드는 여기서 닫지 않는다 — 그쪽은 판정·원장·정책 학습이
 * 함께 움직여야 하므로 결정 카드 화면의 `decide` 가 담당한다.
 */
export async function resolveDecision(projectId: string, id: number, choice: string) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!(await membershipOf(user.id, projectId))) redirect('/projects');

  await serverClient().from('decisions')
    .update({ status: 'resolved', resolved_choice: choice })
    .eq('project_id', projectId).eq('id', id).is('evaluation_id', null);

  revalidatePath(`/p/${projectId}/inbox`);
}
