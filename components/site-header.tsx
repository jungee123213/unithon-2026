import { currentUser } from '@/lib/auth-server';
import { serverClient } from '@/lib/supabase';
import { NavDrawer } from './nav-drawer';

/** 모든 화면 위에 뜨는 유틸리티 바 + 헤더 + 햄버거 메뉴. */
export async function SiteHeader() {
  const user = await currentUser();
  let displayName = '';

  if (user) {
    const { data: profile } = await serverClient()
      .from('profiles').select('display_name').eq('id', user.id).maybeSingle();
    displayName = profile?.display_name ?? user.email ?? '';
  }

  return <NavDrawer loggedIn={!!user} displayName={displayName} />;
}
