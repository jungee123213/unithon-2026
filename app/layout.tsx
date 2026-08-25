import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_KR } from "next/font/google";
import { LogoWordmark } from "@/components/logo";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

/* 영수증은 기계가 찍는다. 그래서 본문까지 모노스페이스다.
   IBM Plex 는 라틴 모노와 한글 산스가 같은 뼈대를 공유하는 몇 안 되는 패밀리다. */
const mono = IBM_Plex_Mono({
  variable: "--font-receipt-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const kr = IBM_Plex_Sans_KR({
  variable: "--font-receipt-kr",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "no meeting", template: "%s · no meeting" },
  description: "회의가 열리기 전에 판정합니다. 확인으로 끝나는 일은 회의가 되지 않습니다.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${mono.variable} ${kr.variable} h-full antialiased`}>
      <body className="paper min-h-full flex flex-col">
        <SiteHeader />
        <main className="flex flex-1 flex-col">{children}</main>
        <footer className="border-t border-[var(--rule)] bg-[var(--card-tint)]">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-6 px-5 py-8 sm:px-10">
            <span className="flex items-center gap-3 text-[var(--ink-faint)]">
              <LogoWordmark className="h-6 w-auto" />
              <span className="font-[family-name:var(--font-receipt-mono)] text-[13px] font-semibold tracking-[0.14em]">
                NO MEETING
              </span>
            </span>
            <span className="text-[15px] font-medium text-[var(--ink-faint)]">
              회의가 열리기 전에 판정합니다
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
