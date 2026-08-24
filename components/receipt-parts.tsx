import type { ReactNode } from 'react';

/** 뜯어낸 자리 — 영수증 롤의 위/아래 톱니 */
export function Tear({ up = false }: { up?: boolean }) {
  return <div aria-hidden className={`tear ${up ? 'tear-up' : ''}`} />;
}

/** 영수증 구분선 */
export function DashRule({ className = '' }: { className?: string }) {
  return <hr className={`rule-dash ${className}`} />;
}

/** 기계가 찍은 라벨 */
export function Stencil({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`stencil ${className}`}>{children}</div>;
}

/** 영수증 한 장 — 톱니 사이에 낀 종이 */
export function Roll({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Tear up />
      <div className="roll px-6 py-5 sm:px-8 sm:py-6">{children}</div>
      <Tear />
    </div>
  );
}

/** 좌우로 벌어진 한 줄 — 품목과 금액 */
export function Line({
  label, value, strong = false,
}: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5">
      <span className={strong ? 'font-semibold' : ''}>{label}</span>
      <span aria-hidden className="flex-1 border-b border-dotted border-[var(--rule)] translate-y-[-.25em]" />
      <span className={`tabular ${strong ? 'font-semibold text-[1.05em]' : ''}`}>{value}</span>
    </div>
  );
}
