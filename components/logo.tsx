/**
 * no meeting 로고.
 *
 * 인라인 SVG 로 두는 이유는 하나다 — `currentColor` 를 쓰려고. 네이비 히어로 위에서는
 * 흰색, 종이 위에서는 검정으로 같은 파일이 뒤집힌다. `<img>` 로는 그게 안 된다.
 *
 * 색은 쓰는 쪽에서 **svg 자신에게** 준다. 감싼 링크에 주면 `.paper a` 가 특정도로
 * 이겨서 로고가 링크 블루로 물든다 — 상속은 자기 요소에 걸린 규칙을 못 이긴다.
 *
 * 개정판(`아트보드 1.svg`)에서 심볼 마크가 빠졌다. 이제 로고는 박스 워드마크 하나이고,
 * 서체도 Arial Black → Arial Bold 로 가벼워졌으며 박스 폭이 314.7 → 286.3 으로 줄었다.
 * 좌표는 원본 아트보드(1638×2048) 값을 그대로 쓴다 — 다음 개정판과 대조하기 쉬우라고.
 */

const WORDMARK_CSS = `
  .nm-w { fill: currentColor; font-family: Arial, Helvetica, sans-serif; font-size: 48px; font-weight: 700; }
  .nm-s { fill: currentColor; font-family: Arial, Helvetica, sans-serif; font-size: 47.4px; font-weight: 700; }
  .nm-t { fill: currentColor; font-family: 'Tamil Sangam MN', 'Helvetica Neue', Arial, sans-serif; font-size: 10px; font-weight: 700; }
  .nm-b { fill: none; stroke: currentColor; stroke-miterlimit: 10; stroke-width: 5px; }
`;

/** 박스 워드마크. 취소선은 원본대로 가로 0.8 배로 눌러 "meeting" 만 덮는다. */
function WordmarkBox() {
  return (
    <>
      <text className="nm-w" transform="translate(225.1 699.7)"><tspan x="0" y="0">no meeting</tspan></text>
      <text className="nm-s" transform="translate(291.9 680.3) scale(.8 1)"><tspan x="0" y="0">_________</tspan></text>
      <rect className="nm-b" x="214.6" y="656.8" width="286.3" height="60.1" />
    </>
  );
}

/**
 * 태그라인. 원본은 자간 보정 때문에 글자 몇 개가 따로 떨어진 `<text>` 로 나온다.
 * 하나로 합치되 x 오프셋은 원본 좌표 그대로 두어야 자간이 무너지지 않는다.
 */
function Tagline() {
  return (
    <text className="nm-t" transform="translate(214.6 649.5)">
      <tspan x="0" y="0">n</tspan>
      <tspan x="5.5" y="0">o</tspan>
      <tspan x="10.8" y="0">.1 me</tspan>
      <tspan x="34.8" y="0">e</tspan>
      <tspan x="40.1" y="0">ting schedule p</tspan>
      <tspan x="106.12" y="0">l</tspan>
      <tspan x="108.5" y="0">a</tspan>
      <tspan x="113.7" y="0">t</tspan>
      <tspan x="117.2" y="0">f</tspan>
      <tspan x="120.6" y="0">orm</tspan>
    </text>
  );
}

/** 박스 워드마크만. 태그라인은 작은 자리에서 읽히지 않으므로 뺀다. */
export function LogoWordmark({ className = 'h-6 w-auto' }: { className?: string }) {
  return (
    <svg viewBox="212 654 292 66" className={className} role="img" aria-label="no meeting">
      <style>{WORDMARK_CSS}</style>
      <WordmarkBox />
    </svg>
  );
}

/** 워드마크 + 태그라인. 헤더 · 랜딩처럼 자리가 있는 곳. */
export function LogoLockup({ className = 'h-8 w-auto' }: { className?: string }) {
  return (
    <svg viewBox="211 639 294 81" className={className} role="img"
      aria-label="no meeting — no.1 meeting schedule platform">
      <style>{WORDMARK_CSS}</style>
      <Tagline />
      <WordmarkBox />
    </svg>
  );
}
