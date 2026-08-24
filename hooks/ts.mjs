#!/usr/bin/env node
/**
 * TeamSync 훅의 JSON 담당.
 *
 * 셸은 정책(킬스위치·브랜치·detach·curl)만 하고, JSON 파싱/조립은 전부 여기서 한다.
 * jq 대신 node 를 쓰는 이유: 팀 전원이 이미 node 를 갖고 있고 jq 는 macOS 기본이 아니다.
 *
 * 사용법:
 *   ts.mjs accumulate <storeDir>              stdin=Stop 훅 JSON  → 턴 1행 누적
 *   ts.mjs payload    <storeDir> <sessionId> <branch> [mergedCsv]  → /api/ingest 본문
 *   ts.mjs sessions   <storeDir>              → "sessionId\tproject\tmember\townerPid" 목록
 *   ts.mjs pullout    <event>                 stdin=API 응답 → SessionStart 훅 출력 JSON
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [, , cmd, ...args] = process.argv;

const readStdin = () => {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
};
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const ensureDir = (d) => fs.mkdirSync(d, { recursive: true });

/** 훅 프로세스의 조상 중 첫 번째 claude 프로세스를 찾는다.
 *  고아 세션 판정(FR-1.5)의 기준: 이 pid 가 죽었으면 그 세션은 끝난 것이다. */
const findOwnerPid = () => {
  let pid = process.ppid;
  for (let i = 0; i < 6 && pid > 1; i++) {
    try {
      const out = execFileSync('ps', ['-o', 'ppid=,command=', '-p', String(pid)], { encoding: 'utf8' }).trim();
      const m = out.match(/^\s*(\d+)\s+(.*)$/);
      if (!m) break;
      if (/claude/i.test(m[2]) && !/ts\.mjs|teamsync/i.test(m[2])) return pid;
      pid = Number(m[1]);
    } catch { break; }
  }
  return process.ppid;
};

// ── accumulate : Stop 훅에서 last_assistant_message 를 1행씩 쌓는다 (FR-1.1) ──
if (cmd === 'accumulate') {
  const storeDir = args[0];
  const hook = parse(readStdin());
  if (!hook) process.exit(0);
  const sessionId = hook.session_id;
  const text = (hook.last_assistant_message || '').trim();
  if (!sessionId || !text) process.exit(0);

  const dir = path.join(storeDir, 'sessions');
  ensureDir(dir);
  fs.appendFileSync(
    path.join(dir, `${sessionId}.jsonl`),
    JSON.stringify({ ts: new Date().toISOString(), text }) + '\n'
  );

  // meta 는 세션당 한 번만 쓴다 (owner_pid 는 첫 턴 시점의 claude 프로세스)
  const metaPath = path.join(dir, `${sessionId}.meta.json`);
  if (!fs.existsSync(metaPath)) {
    fs.writeFileSync(metaPath, JSON.stringify({
      session_id: sessionId,
      project_id: process.env.TEAMSYNC_PROJECT_ID || '',
      member: process.env.TEAMSYNC_MEMBER || '',
      cwd: hook.cwd || process.cwd(),
      project_dir: process.env.CLAUDE_PROJECT_DIR || hook.cwd || '',
      owner_pid: findOwnerPid(),
      started_at: new Date().toISOString(),
    }, null, 2));
  }
  process.exit(0);
}

// ── payload : 누적분을 /api/ingest 본문으로 조립한다 ──
// exit 3 = 보낼 것이 없음(EX-6 길이 미달 또는 빈 세션)
if (cmd === 'payload') {
  const [storeDir, sessionId, branch, mergedCsv] = args;
  const dir = path.join(storeDir, 'sessions');
  const jsonlPath = path.join(dir, `${sessionId}.jsonl`);
  const metaPath = path.join(dir, `${sessionId}.meta.json`);
  if (!fs.existsSync(jsonlPath)) process.exit(3);

  const meta = fs.existsSync(metaPath) ? (parse(fs.readFileSync(metaPath, 'utf8')) || {}) : {};
  const turns = fs.readFileSync(jsonlPath, 'utf8')
    .split('\n').filter(Boolean).map(parse).filter(Boolean);
  if (!turns.length) process.exit(3);

  // EX-6 · 잡음 세션: 누적 텍스트 300자 미만이면 전송 생략
  const total = turns.reduce((n, t) => n + (t.text || '').length, 0);
  if (total < 300 && process.env.TEAMSYNC_FORCE !== '1') {
    process.stderr.write(`[teamsync] skip: too_short (${total} < 300)\n`);
    process.exit(3);
  }

  process.stdout.write(JSON.stringify({
    project_id: process.env.TEAMSYNC_PROJECT_ID || meta.project_id || '',
    member: process.env.TEAMSYNC_MEMBER || meta.member || '',
    session_id: sessionId,
    branch: branch || '',
    turns,
    client_ts: new Date().toISOString(),
    force: process.env.TEAMSYNC_FORCE === '1',
    // 진행사항 문서의 상태 근거 (git 사실). 세션마다 갱신되므로 누가 작업하든 최신이 된다.
    merged_branches: (mergedCsv || '').split(',').map((b) => b.trim()).filter(Boolean),
  }));
  process.exit(0);
}

// ── sessions : 저장된 세션 목록 (고아 회수용, FR-1.5) ──
if (cmd === 'sessions') {
  const dir = path.join(args[0], 'sessions');
  if (!fs.existsSync(dir)) process.exit(0);
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.meta.json')) continue;
    const meta = parse(fs.readFileSync(path.join(dir, f), 'utf8')) || {};
    process.stdout.write([
      meta.session_id || f.replace('.meta.json', ''),
      meta.project_id || '', meta.member || '',
      meta.owner_pid || 0, meta.cwd || '', meta.project_dir || '',
    ].join('\t') + '\n');
  }
  process.exit(0);
}

// ── pullout : API 응답 → SessionStart/UserPromptSubmit 훅 출력 (EX-3) ──
// 계약: injection 문자열을 가공하지 않는다. 영수증 뷰가 같은 문자열을 렌더링한다.
if (cmd === 'pullout') {
  const event = args[0] || 'SessionStart';
  const res = parse(readStdin());
  const injection = res && res.ok && res.injection ? String(res.injection) : '';
  if (!injection.trim()) process.exit(0);           // 주입할 것 없음 → 조용히 통과
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: event, additionalContext: injection },
  }));
  process.exit(0);
}

process.stderr.write(`[teamsync] unknown command: ${cmd}\n`);
process.exit(1);
