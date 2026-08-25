#!/usr/bin/env node
/**
 * .env.vercel 의 값을 Vercel 프로젝트 환경변수로 동기화한다.
 *
 *   node scripts/sync-vercel-env.mjs
 *
 * CLI(`vercel env add`)를 쓰지 않는 이유:
 *   CLI 는 새 변수를 **Sensitive** 로 만든다. Sensitive 변수는 클라이언트에
 *   노출될 수 없어서 NEXT_PUBLIC_ 접두사와 양립하지 않고, 추가가 조용히 거부된다.
 *   실제로 그 때문에 NEXT_PUBLIC_* 3개가 통째로 빠진 채 배포되어 미들웨어가
 *   500 을 냈다. API 로 type 을 직접 지정하면 그 함정이 사라진다.
 *
 * 또 하나: 실패를 삼키지 않는다. 하나라도 실패하면 0 이 아닌 코드로 끝난다.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const API = 'https://api.vercel.com';

const envGet = (key) => {
  const line = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .split('\n').find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1) : '';
};

const TOKEN = process.env.VERCEL_TOKEN || envGet('VERCEL_TOKEN');
if (!TOKEN) { console.error('VERCEL_TOKEN 이 필요합니다 (.env.local)'); process.exit(1); }

const link = JSON.parse(fs.readFileSync(path.join(ROOT, '.vercel/project.json'), 'utf8'));
const { projectId, orgId } = link;
const qs = orgId ? `?teamId=${orgId}` : '';

const vars = fs.readFileSync(path.join(ROOT, '.env.vercel'), 'utf8')
  .split('\n').filter((l) => /^[A-Z]/.test(l))
  .map((l) => { const i = l.indexOf('='); return { key: l.slice(0, i), value: l.slice(i + 1) }; })
  .filter((v) => v.value);

const api = async (method, url, body) => {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

// 기존 변수 목록 — 같은 키가 있으면 지우고 다시 넣는다.
// 한 키가 target(production/preview/development)별로 여러 행일 수 있으므로 전부 모은다.
// 하나만 지우면 남은 행과 ENV_CONFLICT 가 난다.
const existing = await api('GET', `/v9/projects/${projectId}/env${qs}`);
const byKey = new Map();
for (const e of existing.body.envs ?? []) {
  byKey.set(e.key, [...(byKey.get(e.key) ?? []), e]);
}

let failed = 0;
for (const { key, value } of vars) {
  for (const old of byKey.get(key) ?? []) {
    await api('DELETE', `/v9/projects/${projectId}/env/${old.id}${qs}`);
  }

  // NEXT_PUBLIC_* 은 빌드 시 번들에 인라인되어야 하므로 sensitive 로 만들 수 없다.
  const type = key.startsWith('NEXT_PUBLIC_') ? 'plain' : 'encrypted';

  const res = await api('POST', `/v10/projects/${projectId}/env${qs}`, {
    key, value, type, target: ['production', 'preview', 'development'],
  });

  if (res.status >= 200 && res.status < 300) {
    console.log(`  ${key.padEnd(30)} ${type}`);
  } else {
    console.error(`  ${key.padEnd(30)} 실패 (HTTP ${res.status}) ${JSON.stringify(res.body).slice(0, 160)}`);
    failed += 1;
  }
}

if (failed) {
  console.error(`\n${failed}개 실패. 이대로 배포하면 런타임에서 터집니다.`);
  process.exit(1);
}
console.log(`\n${vars.length}개 동기화 완료`);
