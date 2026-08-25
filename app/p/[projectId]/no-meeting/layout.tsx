import { NoMeetingProvider } from '@/lib/no-meeting/store';

/**
 * NO MEETING 구역의 공통 껍데기.
 *
 * 지금은 판정 상태를 브라우저에 들고 있으므로 여기서 Provider 를 씌운다.
 * 백엔드가 붙으면 이 Provider 는 서버 조회로 바뀌고 화면 코드는 그대로 남는다.
 */
export default function NoMeetingLayout({
  children,
}: LayoutProps<'/p/[projectId]/no-meeting'>) {
  return <NoMeetingProvider>{children}</NoMeetingProvider>;
}
