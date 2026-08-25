import Link from 'next/link';

const solidWhite =
  'inline-flex h-[52px] items-center justify-center rounded-sm border-0 bg-white px-7 text-[17px] font-bold text-[var(--navy)] transition-colors hover:bg-[var(--navy-ink-soft)]';
const outlineOnNavy =
  'inline-flex h-[52px] items-center justify-center rounded-sm border border-[var(--navy-border-3)] bg-transparent px-7 text-[17px] font-semibold text-white transition-colors hover:border-[var(--navy-ink-faint)] hover:bg-[var(--navy-soft)]';
const solidInk =
  'inline-flex h-[52px] items-center justify-center rounded-sm border-0 bg-[var(--ink)] px-7 text-[17px] font-bold text-white transition-colors hover:bg-[var(--accent)]';
const outlineInk =
  'inline-flex h-[52px] items-center justify-center rounded-sm border border-[var(--rule)] bg-white px-7 text-[17px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--ink)]';

const INTRO = [
  { label: '수집', title: '세션이 끝나면 자동 전송', body: 'Stop 훅이 마지막 응답을 누적하고, SessionEnd에서 즉시 detach 후 전송합니다. 세션 종료를 막지 않습니다.' },
  { label: '요약', title: '한 호출에 세 벌', body: '동료의 에이전트가 읽을 문장, 비개발자가 읽을 문장, 문서 섹션 제목을 한 번에 만듭니다.' },
  { label: '주입', title: '다음 세션 시작에 도착', body: 'SessionStart에서 동기로 컨텍스트를 받아 주입합니다. 받는 사람은 아무것도 읽지 않습니다.' },
];

const SCREENS = [
  { name: '영수증', body: '동료의 에이전트에게 실제로 주입된 문자열을 가공 없이 그대로 보여줍니다. 대시보드가 아니라 영수증입니다.' },
  { name: '결정 인박스', body: '사실 확인·정책 확인·계산은 이미 답이 있어서 올라오지 않습니다. 가치판단만 사람에게 올라옵니다.' },
  { name: '진행사항', body: '비개발자가 읽는 작업현황. 작업을 쪼개지 않고, 진행률을 추정하지 않습니다. 상태는 git 머지 여부에서만 나옵니다.' },
];

const PRIVACY = [
  { tier: 'L1 범위', rule: '프로젝트 스코프 .claude/settings.json 에만 설치', where: '설치 방식', mono: false },
  { tier: 'L2 브랜치', rule: '화이트리스트에서만 전송 (기본 main, develop, feature/*)', where: 'flush.sh', mono: true },
  { tier: 'L3 내용', rule: '요약 LLM 이 팀 관련성 판정과 민감정보 제외를 동시에', where: 'lib/summarize.ts', mono: true },
  { tier: 'L4 예외', rule: '.teamsync-off 존재 시 즉시 중단', where: 'lib.sh', mono: true },
];

export function Landing() {
  return (
    <div>
      <section className="bg-[var(--navy)] text-white">
        <div className="mx-auto grid max-w-[1280px] items-center gap-16 px-5 py-20 sm:grid-cols-[1.15fr_1fr] sm:px-10 sm:py-[88px]">
          <div>
            <div className="font-[family-name:var(--font-receipt-mono)] text-[13px] font-semibold uppercase tracking-[0.18em] text-[var(--navy-ink-faint-2)]">
              TeamSync
            </div>
            <h1 className="mt-5 text-[38px] font-bold leading-[1.18] tracking-tight sm:text-[56px]">
              보고하지 않는다.<br />읽지 않는다.<br />결정만 한다.
            </h1>
            <p className="mt-5 max-w-[52ch] text-[18px] leading-relaxed text-[var(--navy-ink-soft)] sm:text-[19px]">
              A의 세션 요약이 B의 에이전트에게 그대로 흘러갑니다. 사람이 git log를 훑고
              &ldquo;저 이거 했어요&rdquo;를 알리는 중계기 노릇이 사라집니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className={solidWhite}>회원가입</Link>
              <Link href="/login" className={outlineOnNavy}>로그인</Link>
            </div>
          </div>

          <div className="rounded-sm border border-[var(--navy-border)] bg-[#0b111b] px-7 py-7">
            <div className="font-[family-name:var(--font-receipt-mono)] text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--navy-ink-faint-2)]">
              동료 에이전트에게 주입되는 문자열
            </div>
            <pre className="mt-4 whitespace-pre-wrap break-words font-[family-name:var(--font-receipt-mono)] text-[14px] leading-[1.75] text-[#e3e9f2]">
{`[한끼] 이 프로젝트에서 당신이 마지막으로 작업한 이후 동료 에이전트가 남긴 것:

1. A · 1분 전
   auth/middleware.ts 의 requireUser() 가
   Result<User, AuthError> 를 반환합니다.
   호출부는 result.ok 를 검사해야 합니다.`}
            </pre>
          </div>
        </div>
      </section>

      <section id="intro" className="mx-auto max-w-[1280px] px-5 pt-16 sm:px-10 sm:pt-[72px]">
        <div className="border-b-2 border-[var(--ink)] pb-4">
          <h2 className="text-[24px] font-bold tracking-tight sm:text-[28px]">
            각자 로컬에서 CLI를 띄우면 에이전트는 서로의 존재를 모릅니다
          </h2>
        </div>
        <div className="grid border-b border-[var(--rule-soft)] sm:grid-cols-3">
          {INTRO.map((it, i) => (
            <div
              key={it.label}
              className={`py-8 sm:pr-8 ${i < INTRO.length - 1 ? 'sm:border-r sm:border-[var(--rule-soft)]' : ''} ${i > 0 ? 'sm:pl-8' : ''}`}
            >
              <div className="stencil">{it.label}</div>
              <h3 className="mt-3 text-[19px] font-bold sm:text-[20px]">{it.title}</h3>
              <p className="mt-2.5 text-[16px] leading-relaxed text-[var(--ink-soft)]">{it.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="screens" className="mx-auto max-w-[1280px] px-5 pt-16 sm:px-10 sm:pt-[72px]">
        <div className="border-b-2 border-[var(--ink)] pb-4">
          <h2 className="text-[24px] font-bold tracking-tight sm:text-[28px]">세 개의 화면</h2>
        </div>
        {SCREENS.map((s) => (
          <div key={s.name} className="grid items-baseline gap-4 border-b border-[var(--rule-soft)] py-7 sm:grid-cols-[200px_1fr] sm:gap-10">
            <div className="text-[18px] font-bold sm:text-[19px]">{s.name}</div>
            <div className="text-[16px] leading-relaxed text-[var(--ink-soft)] sm:text-[17px]">{s.body}</div>
          </div>
        ))}
      </section>

      <section id="privacy" className="mx-auto max-w-[1280px] px-5 pt-16 sm:px-10 sm:pt-[72px]">
        <div className="border-b-2 border-[var(--ink)] pb-4">
          <h2 className="text-[24px] font-bold tracking-tight sm:text-[28px]">무엇이 전송되고 무엇이 전송되지 않는가</h2>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-4 border-b border-[var(--rule)] py-3.5 font-[family-name:var(--font-receipt-mono)] text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)] sm:grid-cols-[120px_1fr_220px] sm:gap-8">
          <span>계층</span><span>규칙</span><span className="hidden sm:block">어디서</span>
        </div>
        {PRIVACY.map((row) => (
          <div key={row.tier} className="grid grid-cols-[80px_1fr] items-baseline gap-4 border-b border-[var(--rule-soft)] py-5 sm:grid-cols-[120px_1fr_220px] sm:gap-8">
            <span className="font-[family-name:var(--font-receipt-mono)] text-[15px] font-bold sm:text-[16px]">{row.tier}</span>
            <span className="text-[16px] leading-relaxed sm:text-[17px]">{row.rule}</span>
            <span className={`hidden text-[16px] text-[var(--ink-soft)] sm:block ${row.mono ? 'font-[family-name:var(--font-receipt-mono)]' : ''}`}>
              {row.where}
            </span>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-[1280px] px-5 py-16 sm:px-10 sm:py-24">
        <div className="flex flex-wrap items-center justify-between gap-7 rounded-sm border border-[var(--rule)] bg-[var(--card-tint)] px-8 py-11 sm:px-12">
          <div>
            <h2 className="text-[24px] font-bold tracking-tight sm:text-[26px]">계정을 만들고 프로젝트에 참여합니다</h2>
            <p className="mt-2.5 text-[16px] leading-relaxed text-[var(--ink-soft)] sm:text-[17px]">
              가입 후 훅 설치까지 한 번, 그다음부터는 아무것도 하지 않습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/signup" className={solidInk}>회원가입</Link>
            <Link href="/login" className={outlineInk}>로그인</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
