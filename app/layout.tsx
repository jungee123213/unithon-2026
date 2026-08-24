import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_KR } from "next/font/google";
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
  // 화면마다 성격이 다르다. 영수증은 Team Space 한 곳의 은유이지 제품 전체의 이름이 아니다.
  // 진행사항 문서는 비개발자가 실제로 읽는 화면이라 "영수증"이라 부르면 틀린 말이 된다.
  title: { default: "TeamSync", template: "%s · TeamSync" },
  description: "사람을 거치지 않고 도착한 것들의 기록",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${mono.variable} ${kr.variable} h-full antialiased`}>
      <body className="paper min-h-full flex flex-col">{children}</body>
    </html>
  );
}
