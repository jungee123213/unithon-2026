import { currentUser } from '@/lib/auth-server';
import { NavDrawer } from './nav-drawer';

/**
 * 모든 화면 위에 뜨는 유틸리티 바 + 헤더 + 햄버거 메뉴.
 *
 * 루트 레이아웃에서 렌더되므로 여기서 하는 조회는 모든 페이지의 비용이자
 * 모든 페이지의 실패 지점이 된다. 그래서 쿠키 세션(anon 키)만 읽는다.
 * profiles 조회는 service_role 이 필요해서 뺐다 — 표시 이름 하나 때문에
 * 환경변수 하나가 빠지면 랜딩까지 전부 500 이 된다.
 */
export async function SiteHeader() {
  const user = await currentUser();
  return <NavDrawer loggedIn={!!user} displayName={user?.email ?? ''} />;
}
