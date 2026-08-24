#!/usr/bin/env node
/**
 * 데모용 목 데이터를 실제 Supabase 에 넣는다.
 *
 *   node scripts/seed-demo.mjs [projectId]   (기본: hankki)
 *
 * 훅을 돌리지 않고도 화면 전체를 볼 수 있게 한다 — 실제 파이프라인이
 * 만들어낼 것과 같은 모양의 행을 직접 넣는다. 리허설·발표 준비용이다.
 *
 * 주의: 해당 project_id 의 기존 데이터를 전부 지우고 시작한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROJECT_ID = process.argv[2] || 'hankki';
/** 주입 블록 대괄호 안에 찍히는 이름 — 사람이 읽는 프로젝트 이름 */
const PROJECT_NAME = process.env.PROJECT_NAME || '한끼';

// ── .env.local 로드 ───────────────────────────────────────────────
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .split('\n').filter((l) => /^[A-Z]/.test(l))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }),
);
const URL_ = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) throw new Error('.env.local 에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다');

const rest = async (method, pathname, body) => {
  const res = await fetch(`${URL_}/rest/v1/${pathname}`, {
    method,
    headers: {
      apikey: KEY, authorization: `Bearer ${KEY}`,
      'content-type': 'application/json',
      prefer: body ? 'return=representation' : 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${pathname} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
};

const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();

// ── 목 데이터 ─────────────────────────────────────────────────────
// summary       = 동료 에이전트가 읽고 행동을 바꾸도록 쓴 문장
// summary_plain = 비개발자가 작업현황을 알도록 쓴 문장
// work_label    = 이 브랜치가 무슨 일인지 한 줄
// 가상 시나리오: 동네 배달 앱 "한끼" — 개발자 3명(지우·민서·태호)
//
// 이야기의 핵심은 세 번째 줄이다. 지우가 쿠폰 할인 계산 방식을 바꿨고,
// 그 변경이 민서의 장바구니 총액 계산을 깨뜨린다. 아무도 그 사실을 말하지 않았는데
// 민서의 에이전트는 이미 알고 시작했다 — 그게 이 제품이 하는 일이다.
const SESSIONS = [
  ['태호', 'main', '공통 정리', 3100,
    'order/types.ts 의 Order 타입에 status 필드를 추가했습니다. 값은 pending·cooking·delivering·done 네 가지이고, 기존 isDone 불리언은 제거했습니다. isDone 을 쓰던 화면은 status === "done" 으로 바꿔야 합니다.',
    '주문 상태를 "완료/미완료" 두 가지에서 "접수·조리중·배달중·완료" 네 단계로 늘렸습니다. 손님이 지금 어디쯤인지 볼 수 있게 됩니다.'],

  ['지우', 'develop', '서버 준비', 1900,
    '주문·가게·쿠폰 테이블을 서울 리전에 올리고 시드 데이터를 넣었습니다. 로컬에서 .env 만 채우면 바로 붙습니다.',
    '개발용 서버와 데이터베이스를 만들었습니다. 팀원 누구나 자기 컴퓨터에서 앱을 띄워볼 수 있습니다.'],

  ['태호', 'feature/order-status', '주문 상태 알림', 2750,
    '주문 상태가 바뀔 때 푸시 알림을 보내는 부분을 만들다 중단했습니다. 알림 발송 함수까지는 됐고, 상태 변경 감지와 연결하지 않았습니다.',
    '주문 상태가 바뀌면 손님에게 알림을 보내는 기능을 만들다 멈췄습니다. 절반쯤 됐습니다.'],

  ['지우', 'feature/coupon', '쿠폰 할인', 900,
    'coupon/discount.ts 에 calcDiscount() 를 만들었습니다. 정액 쿠폰과 정률 쿠폰을 모두 처리하고, 최대 할인 한도를 넘지 않도록 자릅니다.',
    '쿠폰 할인 금액을 계산하는 기능을 만들었습니다. 금액 할인과 퍼센트 할인을 둘 다 처리합니다.'],
  ['태호', 'feature/coupon', '쿠폰 할인', 780,
    '쿠폰 유효기간 검사를 추가했습니다. 만료된 쿠폰은 calcDiscount() 에 들어가기 전에 걸러집니다.',
    '기한이 지난 쿠폰은 쓸 수 없게 막았습니다.'],
  ['지우', 'feature/coupon', '쿠폰 할인', 620,
    'calcDiscount() 의 반환값을 number 에서 { amount, appliedCoupon, reason } 객체로 바꿨습니다. 할인이 0원일 때 "쿠폰이 없어서"인지 "조건 미달이라서"인지 구분해야 해서입니다. 이 함수를 쓰는 곳은 장바구니 총액 계산과 주문 확인 화면 두 곳입니다.',
    '할인이 0원일 때 그 이유를 알 수 있게 바꿨습니다. 손님에게 "최소 주문금액이 모자랍니다" 같은 안내를 띄울 수 있게 됩니다.'],

  ['민서', 'feature/cart', '장바구니', 500,
    'cart/store.ts 에 장바구니 담기·빼기·수량변경을 붙였습니다. 상태는 로컬에 저장해서 앱을 껐다 켜도 유지됩니다.',
    '장바구니에 메뉴를 담고 빼는 기능을 만들었습니다. 앱을 껐다 켜도 담아둔 게 남아 있습니다.'],
  ['민서', 'feature/cart', '장바구니', 240,
    '장바구니 총액 계산에 쿠폰을 반영했습니다. calcDiscount() 가 객체를 반환하도록 바뀐 것에 맞춰 amount 를 꺼내 쓰고, reason 은 안내 문구로 화면에 띄웁니다.',
    '장바구니에서 쿠폰 할인이 적용된 최종 금액을 보여줍니다. 할인이 안 되는 경우 이유도 함께 띄웁니다.'],
  ['민서', 'feature/cart', '장바구니', 45,
    '장바구니가 비었을 때 화면을 추가했습니다. 최근 주문한 가게 3곳을 바로가기로 띄웁니다.',
    '장바구니가 비어 있을 때 빈 화면 대신 최근 주문한 가게를 보여줍니다.'],

  ['태호', 'main', '공통 정리', 130,
    'API 에러 응답 형식을 { code, message } 로 통일했습니다. 화면에서는 message 를 그대로 띄우면 됩니다.',
    '오류가 났을 때 손님에게 보여줄 문구를 서버가 정해서 내려주도록 통일했습니다.'],
  ['지우', 'main', '공통 정리', 18,
    '주문 목록 조회에 페이지네이션을 붙였습니다. 한 번에 20건씩 내려오고 커서 방식이라 새 주문이 들어와도 중복되지 않습니다.',
    '주문 목록을 20건씩 나눠서 불러오게 했습니다. 주문이 많아져도 화면이 느려지지 않습니다.'],
];

// git branch --merged 가 알려준 사실
const MERGED = ['feature/coupon'];

const relativeTime = (iso, now) => {
  const min = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
};

/** §5.3 주입 템플릿 — lib/injection.ts 와 같은 문자열이어야 한다 */
const renderInjection = (items, at) =>
  `[${PROJECT_NAME}] 이 프로젝트에서 당신이 마지막으로 작업한 이후 동료 에이전트가 남긴 것:\n` +
  items.map((c, i) => `\n${i + 1}. ${c.member} · ${relativeTime(c.created_at, at)}\n   ${c.summary}\n`).join('');

// ── 실행 ──────────────────────────────────────────────────────────
console.log(`[seed] project_id=${PROJECT_ID}`);

console.log('  기존 데이터 삭제');
for (const t of ['injections', 'decisions', 'context', 'branches']) {
  await rest('DELETE', `${t}?project_id=eq.${PROJECT_ID}`);
}

console.log(`  context ${SESSIONS.length}행`);
const inserted = await rest('POST', 'context',
  SESSIONS.map(([member, branch, work_label, minsAgo, summary, summary_plain], i) => ({
    project_id: PROJECT_ID, member, branch, work_label, summary, summary_plain,
    session_id: `seed-${i}`, created_at: ago(minsAgo),
  })).sort((a, b) => a.created_at.localeCompare(b.created_at)));

console.log(`  branches`);
const branches = [...new Set(SESSIONS.map((s) => s[1]))];
await rest('POST', 'branches', branches.map((branch) => ({
  project_id: PROJECT_ID, branch, merged: MERGED.includes(branch), reported_by: '태호',
})));

// ── 주입 이력 — 실제 pull 이 만들었을 모양으로 ─────────────────────
console.log('  injections (영수증)');
const byId = new Map(inserted.map((r) => [r.id, r]));
const rows = [];

const makeBatch = (member, contextIds, minsAgo) => {
  const at = Date.now() - minsAgo * 60_000;
  const items = contextIds.map((id) => byId.get(id)).filter(Boolean);
  if (!items.length) return;
  const rendered = renderInjection(items, at);
  const batch_id = randomUUID();
  for (const it of items) {
    rows.push({
      project_id: PROJECT_ID, member, context_id: it.id,
      batch_id, rendered, injected_at: new Date(at).toISOString(),
    });
  }
};

const olderThan = (mins) => (r) => new Date(r.created_at).getTime() < Date.now() - mins * 60_000;
const idsOf = (pred) => inserted.filter(pred).map((r) => r.id);

// 초반 — 서로의 기반 작업을 이미 흡수한 상태
makeBatch('민서', idsOf((r) => r.member === '태호' && olderThan(1200)(r)), 1150);
makeBatch('지우', idsOf((r) => r.member === '태호' && olderThan(1200)(r)), 1140);
makeBatch('태호', idsOf((r) => r.member === '지우' && r.branch === 'develop'), 1100);

// ★ 이야기의 핵심 — 지우의 쿠폰 변경이 민서에게 도착한 순간.
//   민서는 이 다음 세션(240분 전)에서 장바구니 총액 계산을 그에 맞춰 고쳤다.
makeBatch('민서', idsOf((r) => r.member === '지우' && r.branch === 'feature/coupon'), 300);
makeBatch('태호', idsOf((r) => r.member === '지우' && r.branch === 'feature/coupon'), 280);

// 최근 — 무대에서 보여줄 영수증
makeBatch('지우', idsOf((r) => r.member === '민서' && r.branch === 'feature/cart'), 30);
makeBatch('민서', idsOf((r) => r.member === '태호' && r.branch === 'main' && !olderThan(1200)(r)), 12);

await rest('POST', 'injections', rows);
console.log(`    ${rows.length}행`);

// ── 결정 (FR-4) ───────────────────────────────────────────────────
console.log('  decisions');
// 코드를 짜다 튀어나온, 사람만 답할 수 있는 것 — 사실 확인도 계산도 아닌 가치판단이다
const srcId = inserted.find((r) => r.branch === 'feature/coupon')?.id ?? null;
await rest('POST', 'decisions', [
  {
    project_id: PROJECT_ID,
    question: '쿠폰을 두 장 이상 같이 쓸 수 있게 할까요?',
    options: [
      { label: '한 장만', rationale: '두 장을 겹치면 원가보다 싸게 팔리는 주문이 생깁니다. 지금 구조로는 막을 방법이 없습니다.' },
      { label: '허용', rationale: '신규 가입 쿠폰과 가게 쿠폰을 같이 쓰게 하면 첫 주문 전환이 올라갑니다. 경쟁 앱은 대부분 허용합니다.' },
    ],
    status: 'open', resolved_choice: null, source_context_id: srcId, created_at: ago(9),
  },
  {
    project_id: PROJECT_ID,
    question: '무료배달 기준을 12,000원에서 15,000원으로 올릴까요?',
    options: [
      { label: '올리지 않음', rationale: '1인 주문이 전체의 절반입니다. 기준을 올리면 이들이 대부분 이탈합니다.' },
      { label: '올림', rationale: '건당 배달비 적자가 평균 1,800원입니다. 기준을 올리면 손익분기에 닿습니다.' },
    ],
    status: 'resolved', resolved_choice: '올리지 않음', source_context_id: null, created_at: ago(700),
  },
]);

console.log(`[seed] 완료 — http://localhost:3000/p/${PROJECT_ID}`);
