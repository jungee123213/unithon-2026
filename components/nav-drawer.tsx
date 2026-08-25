'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoLockup } from './logo';

const solidBtn =
  'inline-flex h-10 items-center justify-center rounded-sm border-0 bg-[var(--ink)] px-5 text-[15px] font-semibold text-white transition-colors hover:bg-[var(--accent)]';
const outlineBtn =
  'inline-flex h-10 items-center justify-center rounded-sm border border-[var(--rule)] bg-white px-[18px] text-[15px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--ink)]';
const navTab =
  'inline-flex h-11 items-center whitespace-nowrap px-2.5 text-[14px] font-semibold text-[var(--ink)] transition-colors hover:text-[var(--accent)]';

function projectIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/p\/([^/]+)/) ?? pathname.match(/^\/projects\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function NavDrawer({
  loggedIn, displayName,
}: { loggedIn: boolean; displayName: string }) {
  const pathname = usePathname();
  const projectId = projectIdFromPath(pathname);
  const inProject = projectId !== null;
  const utilityLabel = loggedIn
    ? `${displayName} 님으로 로그인됨${inProject ? ` · ${projectId}` : ''}`
    : 'Claude Code · Codex CLI 훅 연동';

  return (
    <div className="border-b border-[var(--rule)] bg-white">
      {/* 유틸리티 바 */}
      <div className="border-b border-[var(--rule-soft)]">
        <div className="mx-auto flex h-[38px] max-w-[1280px] items-center justify-between px-5 sm:px-10">
          <span className="truncate text-[13px] font-medium text-[var(--ink-faint)]">{utilityLabel}</span>
          {loggedIn ? (
            <form action="/api/signout" method="post">
              <button className="shrink-0 border-b border-[var(--rule)] pb-0.5 text-[13px] font-semibold text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]">
                로그아웃
              </button>
            </form>
          ) : (
            pathname === '/' && (
              <a href="#intro" className="shrink-0 text-[13px] font-semibold text-[var(--ink-faint)] hover:text-[var(--accent)]">
                문서
              </a>
            )
          )}
        </div>
      </div>

      {/* 헤더 */}
      <header className="sticky top-0 z-20 border-b border-[var(--rule)] bg-white">
        <div className="mx-auto flex min-h-[72px] max-w-[1280px] flex-wrap items-center gap-5 px-5 py-3.5 sm:px-10">
          <Link href={loggedIn ? '/projects' : '/'} aria-label="no meeting" className="flex shrink-0 items-center text-[var(--ink)]">
            <LogoLockup className="h-[30px] w-auto" />
          </Link>

          {inProject && (
            <nav className="flex flex-wrap items-center">
              <Link href={`/p/${projectId}/no-meeting`} className={navTab}>회의 판정</Link>
              <Link href={`/p/${projectId}/inbox`} className={navTab}>결정 인박스</Link>
              <Link href={`/p/${projectId}/no-meeting/ledger`} className={navTab}>결정 원장</Link>
              <Link href={`/p/${projectId}/no-meeting/connections`} className={navTab}>연결</Link>
              <Link href={`/p/${projectId}/progress`} className={navTab}>진행사항</Link>
              <Link href={`/projects/${projectId}`} className={navTab}>프로젝트 설정</Link>
            </nav>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-3">
            {loggedIn ? (
              <Link href="/projects" className={outlineBtn}>프로젝트 목록</Link>
            ) : (
              <>
                <Link href="/login" className={outlineBtn}>로그인</Link>
                <Link href="/signup" className={solidBtn}>회원가입</Link>
              </>
            )}
          </div>
        </div>
      </header>
    </div>
  );
}
