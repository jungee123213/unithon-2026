'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserClient } from '@/lib/supabase';

/**
 * FR-5.4 · 새 컨텍스트 도착 시 화면이 자동 갱신된다.
 *
 * 서버 컴포넌트가 단일 진실 원본이다. Realtime 은 "다시 읽어라"는 신호만 준다 —
 * 클라이언트에서 행을 직접 합치면 카운터(§5.4)가 서버 계산과 어긋난다.
 */
export function useRealtime(projectId: string) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let db;
    try {
      db = browserClient();
    } catch {
      return; // 환경변수 미설정 — 화면은 정적으로라도 뜬다
    }

    const filter = `project_id=eq.${projectId}`;
    const channel = db
      .channel(`teamsync:${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'context', filter }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'injections', filter }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'decisions', filter }, () => router.refresh())
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'));

    return () => { db.removeChannel(channel); };
  }, [projectId, router]);

  return connected;
}

export function LiveBadge({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`live-dot inline-block h-2 w-2 rounded-full ${connected ? '' : 'opacity-30'}`}
        style={{ background: connected ? 'var(--live)' : 'var(--ink-faint)' }}
      />
      <span className="stencil">{connected ? 'live' : 'offline'}</span>
    </div>
  );
}
