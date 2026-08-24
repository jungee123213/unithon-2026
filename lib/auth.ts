/** §9.3 · API Route 공유 시크릿 헤더 1개. 인증·권한 UI 는 이번에 하지 않는다(§4 W). */
export function authorized(req: Request): boolean {
  const expected = process.env.TEAMSYNC_TOKEN;
  if (!expected) return true;              // 미설정이면 통과 — 로컬 개발을 막지 않는다
  return req.headers.get('x-teamsync-token') === expected;
}
