import { DashRule, Roll, Stencil } from './receipt-parts';

/** 흰 화면 대신 원인을 찍는다. 무대에서 디버깅할 시간은 없다 (EX-5 의 정신). */
export function SetupNotice({ error }: { error: string }) {
  return (
    <div className="mx-auto w-full max-w-[760px] px-5 py-16">
      <Roll>
        <Stencil>설정 필요</Stencil>
        <h1 className="mt-2 text-[24px] font-semibold">아직 연결되지 않았습니다</h1>
        <DashRule className="my-4" />
        <ol className="space-y-2 text-[17px] leading-relaxed">
          <li>1. Supabase(서울 리전) 프로젝트에 <code className="tabular">supabase/schema.sql</code> 실행</li>
          <li>2. <code className="tabular">.env.local</code> 에 <code className="tabular">SUPABASE_URL</code>,
             <code className="tabular"> SUPABASE_SERVICE_ROLE_KEY</code>,
             <code className="tabular"> NEXT_PUBLIC_SUPABASE_URL</code>,
             <code className="tabular"> NEXT_PUBLIC_SUPABASE_ANON_KEY</code>,
             <code className="tabular"> ANTHROPIC_API_KEY</code>, <code className="tabular">TEAMSYNC_TOKEN</code></li>
          <li>3. 개발 서버 재시작</li>
        </ol>
        <DashRule className="my-4" />
        <Stencil>원인</Stencil>
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[15px] text-[var(--stamp)]">{error}</pre>
      </Roll>
    </div>
  );
}
