import Link from 'next/link';
import type { ReactNode } from 'react';

type Crumb = { label: string; href?: string };

/** 각 화면 맨 위 남색 히어로 — 이름/위치(breadcrumb)와 제목을 먼저 보여준다. */
export function PageHero({
  crumbs, title, subtitle, backHref, backLabel = '← 뒤로', actions, maxWidth = 1000,
}: {
  crumbs: Crumb[];
  title: ReactNode;
  subtitle?: ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  maxWidth?: number;
}) {
  return (
    <section className="grid-paper bg-[var(--navy)] text-white">
      <div className="mx-auto px-5 py-8 sm:px-8" style={{ maxWidth }}>
        <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-[var(--navy-ink-faint)]">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span className="text-[var(--navy-divider)]">/</span>}
              {c.href ? (
                <Link href={c.href} className="hover:text-white">{c.label}</Link>
              ) : (
                <span className={i === crumbs.length - 1 ? 'font-semibold text-white' : ''}>{c.label}</span>
              )}
            </span>
          ))}
        </div>

        {backHref && (
          <Link
            href={backHref}
            className="mt-5 inline-flex h-[42px] items-center gap-2 rounded-sm border border-[var(--navy-border-2)] px-[18px] text-[15px] font-semibold text-white transition-colors hover:border-[var(--navy-ink-faint-2)] hover:bg-[var(--navy-soft)]"
          >
            {backLabel}
          </Link>
        )}

        <h1 className="mt-5 text-[32px] font-bold leading-tight tracking-tight sm:text-[40px]">{title}</h1>
        {subtitle && (
          <p className="mt-3 max-w-[70ch] text-[17px] leading-relaxed text-[var(--navy-ink-soft)] sm:text-[18px]">
            {subtitle}
          </p>
        )}
        {actions && <div className="mt-5 flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </section>
  );
}
