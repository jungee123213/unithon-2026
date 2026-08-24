'use server';

import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase';

/** FR-4.2 · 사람이 실제로 판단하는 유일한 지점. 여기 말고는 사람이 개입할 곳이 없다. */
export async function resolveDecision(projectId: string, id: number, choice: string) {
  const db = serverClient();
  await db.from('decisions')
    .update({ status: 'resolved', resolved_choice: choice })
    .eq('id', id).eq('project_id', projectId);
  revalidatePath(`/p/${projectId}/inbox`);
  revalidatePath(`/p/${projectId}`);
}
