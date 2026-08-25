'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { LogoLockup } from './logo';

const solidBtn =
  'inline-flex h-10 items-center justify-center rounded-sm border-0 bg-[var(--ink)] px-5 text-[15px] font-semibold text-white transition-colors hover:bg-[var(--accent)]';
const outlineBtn =
  'inline-flex h-10 items-center justify-center rounded-sm border border-[var(--rule)] bg-white px-[18px] text-[15px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--ink)]';

function projectIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/p\/([^/]+)/) ?? pathname.match(/^\/projects\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function NavDrawer({
  loggedIn, displayName,
}: { loggedIn: boolean; displayName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // 화면(경로)이 바뀌면 메뉴는 자동으로 닫힌다 (렌더 중 상태 조정 — effect 아님)
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    if (open) setOpen(false);
  }

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
        <div className="mx-auto flex h-[72px] max-w-[1280px] items-center gap-5 px-5 sm:px-10">
          <button
            onClick={() => setOpen(true)}
            aria-label="메뉴 열기"
            className="flex h-11 w-11 flex-col justify-center gap-[5px] rounded-sm border border-[var(--rule)] px-[11px] transition-colors hover:border-[var(--ink)]"
          >
            <span className="block h-[2px] bg-[var(--ink)]" />
            <span className="block h-[2px] bg-[var(--ink)]" />
            <span className="block h-[2px] bg-[var(--ink)]" />
          </button>

          <Link href={loggedIn ? '/projects' : '/'} className="flex items-center text-[var(--ink)]">
            <LogoLockup className="h-[30px] w-auto" />
          </Link>

          <div className="ml-auto flex items-center gap-3">
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

      {/* 메뉴 드로어 */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[60]">
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              aria-label="메뉴 닫기"
              onClick={close}
              className="absolute inset-0 h-full w-full cursor-pointer border-0 bg-[rgba(16,24,35,.45)]"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="absolute left-0 top-0 flex h-full w-[360px] max-w-[88vw] flex-col border-r border-[var(--rule)] bg-white shadow-[10px_0_28px_rgba(20,22,26,.16)]"
            >
              <div className="flex items-center justify-between gap-4 border-b-2 border-[var(--ink)] px-5 py-[22px]">
                <span className="stencil">메뉴</span>
                <button onClick={close} className={outlineBtn.replace('h-10', 'h-9').replace('px-[18px]', 'px-3.5')}>
                  닫기
                </button>
              </div>

              {!loggedIn ? (
                <div className="px-5 py-7">
                  <p className="text-[18px] font-bold text-[var(--ink)]">로그인이 필요합니다.</p>
                  <p className="mt-2.5 text-[16px] leading-relaxed text-[var(--ink-soft)]">
                    회의 판정 · 결정 원장 · 진행사항은 로그인한 뒤 프로젝트에 들어가면 열립니다.
                  </p>
                  <Link href="/login" className={`${solidBtn} mt-5 w-full`}>로그인</Link>
                  <Link href="/signup" className={`${outlineBtn} mt-2.5 w-full`}>회원가입</Link>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <div className="px-5 pb-2.5 pt-5">
                    <span className="stencil">내 계정</span>
                  </div>
                  <Link
                    href="/projects"
                    className="flex h-[52px] items-center justify-between gap-3 border-b border-[var(--rule-soft)] px-4 text-[17px] font-semibold text-[var(--ink)] hover:bg-[var(--card-tint)]"
                  >
                    프로젝트 목록
                  </Link>

                  {inProject ? (
                    <>
                      <div className="px-5 pb-2.5 pt-6">
                        <span className="stencil">{projectId}</span>
                      </div>
                      {/* 영수증(/p/[projectId])은 메뉴에서 뺐다. 라우트와 컴포넌트는 남아 있으므로
                          다시 쓰려면 이 배열에 한 줄 추가하면 된다. */}
                      {[
                        ['회의 판정', `/p/${projectId}/no-meeting`],
                        ['결정 인박스', `/p/${projectId}/inbox`],
                        ['결정 원장', `/p/${projectId}/no-meeting/ledger`],
                        ['연결', `/p/${projectId}/no-meeting/connections`],
                        ['진행사항', `/p/${projectId}/progress`],
                        ['프로젝트 설정', `/projects/${projectId}`],
                      ].map(([label, href]) => (
                        <Link
                          key={href}
                          href={href}
                          className="flex h-[52px] items-center justify-between gap-3 border-b border-[var(--rule-soft)] px-4 text-[17px] font-semibold text-[var(--ink)] hover:bg-[var(--card-tint)]"
                        >
                          {label}
                        </Link>
                      ))}
                    </>
                  ) : (
                    <div className="mx-5 mt-6 rounded-sm border border-dashed border-[var(--rule)] p-5">
                      <p className="text-[16px] font-bold text-[var(--ink)]">프로젝트에 들어가면 더 열립니다.</p>
                      <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-soft)]">
                        회의 판정 · 결정 원장 · 진행사항은 프로젝트 안의 화면입니다. 목록에서 프로젝트를 열어주세요.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
