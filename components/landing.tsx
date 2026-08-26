import Link from 'next/link';
import { LogoLockup } from './logo';

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

const VERDICTS = [
  {
    name: '회의 없음', code: 'DELETE', ink: 'var(--verdict-delete)',
    left: '남은 게 아무것도 없음',
    body: '조건을 전부 근거로 충족했습니다. 이 회의는 열리지 않습니다.',
  },
  {
    name: '비동기 처리', code: 'ASYNC', ink: 'var(--verdict-async)',
    left: '확인 하나만 남음',
    body: '모여서 풀 것이 아니라 담당자에게 물으면 끝납니다. 해결 로그로 종료합니다.',
  },
  {
    name: '사람 결정', code: 'DECIDE', ink: 'var(--verdict-decide)',
    left: '가치판단 하나만 남음',
    body: '사실 확인·정책 확인·계산은 이미 답이 나왔습니다. 결정 카드 한 장이 담당자에게 갑니다.',
  },
  {
    name: '축소 개최', code: 'SHRINK', ink: 'var(--verdict-shrink)',
    left: '사람 수를 줄일 수 있음',
    body: '동시 대화가 필요합니다. 대신 근거에 등장하는 사람만, 더 짧게 엽니다.',
  },
  {
    name: '회의 유지', code: 'MEET', ink: 'var(--verdict-meet)',
    left: '아무것도 못 줄임',
    body: '이 회의는 없앨 수 없습니다. 브레인스토밍과 1:1 은 검사조차 하지 않고 그대로 엽니다.',
  },
];

const CRITERIA = [
  {
    step: '01', head: '유형을 먼저 가른다',
    body: '여덟 유형 중 하나로 분류하고, 유형마다 다른 조건을 겁니다. 1·2위 확신 차가 작으면 확정하지 않고 목적을 한 줄 되묻습니다.',
  },
  {
    step: '02', head: '문장이 아니라 근거를 읽는다',
    body: '신청안의 제목과 본문은 판정에 쓰지 않습니다. 이슈트래커·장애 알림·세션 요약에 실제로 박힌 값만 봅니다.',
  },
  {
    step: '03', head: '기준 숫자는 조직이 정한다',
    body: '“최신” 이 몇 시간인지 같은 값은 데이터에서 나오지 않습니다. 유형별로 조직이 정해 두고, 판정 화면에 그 숫자를 그대로 적습니다.',
  },
  {
    step: '04', head: '근거가 없으면 확인 불가다',
    body: '값이 없는 것과 0 인 것을 구분합니다. 확인 불가가 하나라도 있으면 회의를 지우지 않습니다.',
  },
  {
    step: '05', head: '남은 개수로 갈래가 정해진다',
    body: '모여야만 풀리는 게 몇 개 남았는가 — 그것만 셉니다. 결과는 해결 로그·결정 카드·회의 처방전 중 하나로 나옵니다.',
  },
];

export function Landing() {
  return (
    <div>
      <section className="bg-[var(--navy)] text-white">
        <div className="mx-auto grid max-w-[1280px] items-center gap-16 px-5 py-20 sm:grid-cols-[1.15fr_1fr] sm:px-10 sm:py-[88px]">
          <div>
            <LogoLockup className="h-11 w-auto text-white" />
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

      <section id="verdicts" className="mx-auto max-w-[1280px] px-5 pt-16 sm:px-10 sm:pt-[72px]">
        <div className="border-b-2 border-[var(--ink)] pb-4">
          <h2 className="text-[24px] font-bold tracking-tight sm:text-[28px]">회의를 다섯 갈래로 가릅니다</h2>
          <p className="mt-2.5 max-w-[64ch] text-[16px] leading-relaxed text-[var(--ink-soft)] sm:text-[17px]">
            필요 없는 회의는 지우고, 사람이 필요한 자리만 남깁니다. 기준은 하나입니다 &mdash;
            모여야만 풀리는 게 몇 개 남았는가.
          </p>
        </div>

        <div className="mt-9 font-[family-name:var(--font-receipt-mono)] text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)]">
          모이지 않고 끝납니다
        </div>
        {VERDICTS.slice(0, 3).map((v) => (
          <div key={v.code} className="grid items-baseline gap-2 border-b border-[var(--rule-soft)] py-6 sm:grid-cols-[190px_230px_1fr] sm:gap-8">
            <div className="text-[18px] font-bold sm:text-[19px]" style={{ color: v.ink }}>
              {v.name}
              <span className="ml-2.5 font-[family-name:var(--font-receipt-mono)] text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
                {v.code}
              </span>
            </div>
            <div className="text-[16px] font-semibold sm:text-[17px]">{v.left}</div>
            <div className="text-[16px] leading-relaxed text-[var(--ink-soft)] sm:text-[17px]">{v.body}</div>
          </div>
        ))}

        <div className="mt-9 font-[family-name:var(--font-receipt-mono)] text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)]">
          실제로 모이는 건 이 둘뿐입니다
        </div>
        {VERDICTS.slice(3).map((v) => (
          <div key={v.code} className="grid items-baseline gap-2 border-b border-[var(--rule-soft)] py-6 sm:grid-cols-[190px_230px_1fr] sm:gap-8">
            <div className="text-[18px] font-bold sm:text-[19px]" style={{ color: v.ink }}>
              {v.name}
              <span className="ml-2.5 font-[family-name:var(--font-receipt-mono)] text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
                {v.code}
              </span>
            </div>
            <div className="text-[16px] font-semibold sm:text-[17px]">{v.left}</div>
            <div className="text-[16px] leading-relaxed text-[var(--ink-soft)] sm:text-[17px]">{v.body}</div>
          </div>
        ))}
      </section>

      <section id="criteria" className="mx-auto max-w-[1280px] px-5 pt-16 sm:px-10 sm:pt-[72px]">
        <div className="border-b-2 border-[var(--ink)] pb-4">
          <h2 className="text-[24px] font-bold tracking-tight sm:text-[28px]">회의 신청안이 올라오면 무엇을 보는가</h2>
        </div>
        {CRITERIA.map((c) => (
          <div key={c.step} className="grid grid-cols-[44px_1fr] items-baseline gap-4 border-b border-[var(--rule-soft)] py-6 sm:grid-cols-[80px_300px_1fr] sm:gap-8">
            <span className="font-[family-name:var(--font-receipt-mono)] text-[15px] font-bold text-[var(--ink-faint)] sm:text-[16px]">{c.step}</span>
            <span className="text-[17px] font-bold sm:text-[18px]">{c.head}</span>
            <span className="col-start-2 text-[16px] leading-relaxed text-[var(--ink-soft)] sm:col-start-auto sm:text-[17px]">{c.body}</span>
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
