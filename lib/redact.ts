/**
 * §5.1 L3 · 사후 정규식 필터.
 *
 * 프롬프트로 "포함하지 마라"고 시키는 것은 확률적이다. 이건 결정론적이다.
 * 둘 다 한다 — 프롬프트는 의도를, 정규식은 보장을 담당한다.
 */
const RULES: { name: string; re: RegExp }[] = [
  { name: 'anthropic_key', re: /\bsk-ant-[A-Za-z0-9_-]{8,}/g },
  { name: 'openai_key',    re: /\bsk-[A-Za-z0-9_-]{16,}/g },
  { name: 'github_token',  re: /\bgh[pousr]_[A-Za-z0-9]{16,}/g },
  { name: 'bearer',        re: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi },
  { name: 'aws_key',       re: /\bAKIA[0-9A-Z]{12,}/g },
  { name: 'jwt',           re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { name: 'email',         re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  // 32자 이상 16진수 — 해시·시크릿. 커밋 SHA(7~40)도 걸리지만 요약에 원문 SHA 가 필요할 일은 없다.
  { name: 'hex32',         re: /\b[0-9a-fA-F]{32,}\b/g },
];

export type RedactResult = { text: string; hits: string[] };

export function redact(input: string): RedactResult {
  let text = input;
  const hits: string[] = [];
  for (const { name, re } of RULES) {
    text = text.replace(re, () => {
      if (!hits.includes(name)) hits.push(name);
      return `[${name} 제거됨]`;
    });
  }
  return { text, hits };
}
