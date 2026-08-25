/**
 * NO MEETING 구역의 공통 껍데기.
 *
 * 판정 상태는 서버(Supabase)에 있다. 화면은 서버 컴포넌트에서 읽어 내려주므로
 * 여기에 클라이언트 Provider 가 없다.
 */
export default function NoMeetingLayout({
  children,
}: LayoutProps<'/p/[projectId]/no-meeting'>) {
  return children;
}
