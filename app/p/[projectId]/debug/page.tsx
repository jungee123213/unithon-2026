import { DebugConsole, type IngestEvent } from '@/components/debug-console';
import { SetupNotice } from '@/components/setup-notice';
import { serverClient } from '@/lib/supabase';

export const metadata = { title: '디버그' };
export const dynamic = 'force-dynamic';

export default async function DebugPage({ params }: PageProps<'/p/[projectId]/debug'>) {
  const { projectId } = await params;

  let events: IngestEvent[] | null = null;
  let error = '';
  try {
    const { data } = await serverClient()
      .from('ingest_log').select('*')
      .eq('project_id', projectId)
      .order('id', { ascending: false })
      .limit(60);
    events = (data ?? []) as IngestEvent[];
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  if (!events) return <SetupNotice error={error} />;
  return <DebugConsole projectId={projectId} events={events} />;
}
