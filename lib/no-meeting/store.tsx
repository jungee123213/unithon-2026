'use client';

import {
  createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode,
} from 'react';
import { evaluate } from './mock-engine';
import {
  CONNECTORS, RULE_VERSION, buildAuthored, buildScenarios, buildSeedConnections,
  buildSeedLedger, buildSeedPolicies,
} from './mock-data';
import type {
  ConnectionState, ConnectorId, Evaluation, LedgerEntry, Policy, Scenario,
} from './types';

/**
 * 목업 단계의 상태 보관소.
 *
 * 나중에 이 자리는 서버(Route Handler + Supabase)가 가져간다. 지금 sessionStorage 를
 * 쓰는 이유는 하나다 — 판정 → 결정 → 원장 → 정책 승격이 화면을 넘어가며 이어져야
 * "판정 과정을 전부 진행" 한 것이 되기 때문이다. 탭을 닫으면 초기화된다.
 *
 * 서버 렌더에는 아무것도 없고(getServerSnapshot → null) 하이드레이션 이후에 값이
 * 들어온다. 그래야 "3시간 전" 같은 상대 시각이 서버/클라이언트에서 어긋나지 않는다.
 */

/** 저장 모양이 바뀌면 키를 올린다. 예전 탭에 남은 판정이 새 화면을 깨뜨리지 않게. */
const KEY = 'no-meeting:v4';

type Persisted = {
  now: number;
  evaluations: Evaluation[];
  ledger: LedgerEntry[];
  policies: Policy[];
  connections: Record<ConnectorId, ConnectionState>;
};

// ── 외부 저장소 (React 바깥) ─────────────────────────────────────

let cached: Persisted | null = null;
const listeners = new Set<() => void>();

function seed(): Persisted {
  const now = Date.now();
  return {
    now,
    evaluations: [],
    ledger: buildSeedLedger(now),
    policies: buildSeedPolicies(now),
    connections: buildSeedConnections(now),
  };
}

/**
 * 저장된 값이 지금 코드와 같은 모양인지 확인한다.
 *
 * 키를 올리는 것만으로는 부족하다 — 커넥터가 하나 늘거나 이름이 바뀌면 예전 탭의
 * 값에는 그 키가 없고, 화면은 `connections[id].status` 에서 터진다.
 * 실제로 커넥터를 ci → alerts 로 바꾸면서 한 번 터뜨렸다. 모양이 안 맞으면 새로 시작한다.
 */
function isUsable(p: Persisted | null): p is Persisted {
  return !!p?.now
    && !!p.connections
    && CONNECTORS.every((c) => !!p.connections[c.id])
    && Array.isArray(p.evaluations)
    && Array.isArray(p.ledger)
    && Array.isArray(p.policies);
}

function load(): Persisted {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as Persisted | null;
    return isUsable(parsed) ? parsed : seed();
  } catch {
    return seed();
  }
}

function persist(p: Persisted) {
  try { window.sessionStorage.setItem(KEY, JSON.stringify(p)); } catch { /* 용량 초과는 무시 */ }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot(): Persisted | null {
  cached ??= load();
  return cached;
}

/** 서버에는 판정 이력이 없다. 첫 페인트는 언제나 빈 뼈대다. */
function getServerSnapshot(): Persisted | null {
  return null;
}

function update(fn: (prev: Persisted) => Persisted) {
  const next = fn(cached ?? load());
  cached = next;
  persist(next);
  listeners.forEach((l) => l());
}

// ── 컨텍스트 ──────────────────────────────────────────────────────

type Store = {
  now: number;
  scenarios: Scenario[];
  evaluations: Evaluation[];
  ledger: LedgerEntry[];
  policies: Policy[];
  connections: Record<ConnectorId, ConnectionState>;
  connected: Set<ConnectorId>;
  ruleVersion: string;

  scenarioOf: (id: string) => Scenario | undefined;
  evaluationOf: (id: string) => Evaluation | undefined;

  run: (scenarioId: string, liveData: Record<string, number | boolean>) => string;
  decide: (evaluationId: string, optionKey: string) => void;
  revert: (evaluationId: string, reason: string) => void;
  activatePolicy: (policyId: string) => void;
  connect: (id: ConnectorId, accountLabel: string) => void;
  disconnect: (id: ConnectorId) => void;
  reset: () => void;
};

const Ctx = createContext<Store | null>(null);

export function useNoMeeting(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('NoMeetingProvider 안에서만 쓸 수 있습니다.');
  return ctx;
}

/**
 * 되돌린 결정은 집계에서 뺀다. 잘못된 판단이 정책으로 굳는 것을 막는 규칙이라
 * 화면이 아니라 집계 함수 안에 있어야 한다.
 */
function recountPolicies(policies: Policy[], ledger: LedgerEntry[]): Policy[] {
  const reverted = new Set(
    ledger.filter((l) => l.eventType === 'REVERTED' && l.evaluationId).map((l) => l.evaluationId),
  );

  return policies.map((p) => {
    if (p.status === 'ACTIVE') return p;
    const decided = ledger.filter(
      (l) => l.eventType === 'DECIDED'
        && l.patternKey === p.patternKey
        && l.selectedOptionKey === p.selectedOptionKey
        && !(l.evaluationId && reverted.has(l.evaluationId)),
    );
    return {
      ...p,
      decisionCount: decided.length,
      sourceDecisions: decided.map((l) => ({
        id: l.id, date: l.occurredAt.slice(0, 10), title: l.title,
      })),
    };
  });
}

export function NoMeetingProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const scenarios = useMemo(() => (state ? buildScenarios(state.now) : []), [state]);

  const run = useCallback((scenarioId: string, liveData: Record<string, number | boolean>) => {
    const id = `ev-${Math.random().toString(36).slice(2, 9)}`;
    update((prev) => {
      const sc = buildScenarios(prev.now).find((s) => s.id === scenarioId);
      if (!sc) return prev;

      const connected = new Set(
        (Object.keys(prev.connections) as ConnectorId[])
          .filter((k) => prev.connections[k].status === 'CONNECTED'),
      );

      const ev = evaluate({
        scenario: sc,
        liveData,
        authored: buildAuthored(prev.now)[sc.slug],
        activePolicies: prev.policies,
        connected,
        now: Date.now(), id,
      });

      const passed = ev.gateChecks.filter((g) => g.status === 'PASS').length;
      const entry: LedgerEntry = {
        id: `lg-${id}`,
        eventType: 'EVALUATED',
        outcome: ev.outcome,
        actor: '시스템',
        title: ev.title,
        summary: ev.outcome
          ? `${ev.meetingType} · 조건 ${passed}/${ev.gateChecks.length} 충족`
          : '유형을 확정하지 못해 목적을 되물었습니다.',
        occurredAt: ev.requestedAt,
        evaluationId: ev.id,
        ruleVersion: RULE_VERSION,
      };

      return { ...prev, evaluations: [ev, ...prev.evaluations], ledger: [entry, ...prev.ledger] };
    });
    return id;
  }, []);

  const decide = useCallback((evaluationId: string, optionKey: string) => {
    update((prev) => {
      const ev = prev.evaluations.find((e) => e.id === evaluationId);
      if (!ev || ev.decisionStatus !== 'PENDING' || ev.artifact?.type !== 'DECISION_CARD') return prev;

      const option = ev.artifact.content.options.find((o) => o.key === optionKey);
      if (!option) return prev;

      const evaluations = prev.evaluations.map((e) =>
        e.id === evaluationId ? { ...e, decisionStatus: 'DECIDED' as const, selectedOptionKey: optionKey } : e);

      const entry: LedgerEntry = {
        id: `lg-d-${evaluationId}`,
        eventType: 'DECIDED', outcome: 'DECIDE',
        actor: ev.artifact.content.deciderRole,
        title: ev.title,
        summary: `“${option.label}” 을 선택했습니다.`,
        occurredAt: new Date().toISOString(),
        evaluationId, ruleVersion: RULE_VERSION,
        patternKey: ev.patternKey ?? null, selectedOptionKey: optionKey,
      };

      const ledger = [entry, ...prev.ledger];
      return { ...prev, evaluations, ledger, policies: recountPolicies(prev.policies, ledger) };
    });
  }, []);

  const revert = useCallback((evaluationId: string, reason: string) => {
    update((prev) => {
      const ev = prev.evaluations.find((e) => e.id === evaluationId);
      if (!ev || ev.decisionStatus !== 'DECIDED') return prev;

      const evaluations = prev.evaluations.map((e) =>
        e.id === evaluationId ? { ...e, decisionStatus: 'REVERTED' as const, revertReason: reason } : e);

      const entry: LedgerEntry = {
        id: `lg-r-${evaluationId}`,
        eventType: 'REVERTED', outcome: 'DECIDE',
        actor: ev.artifact?.type === 'DECISION_CARD' ? ev.artifact.content.deciderRole : '릴리즈 매니저',
        title: ev.title,
        summary: `되돌림 — ${reason}`,
        occurredAt: new Date().toISOString(),
        evaluationId, ruleVersion: RULE_VERSION,
        patternKey: ev.patternKey ?? null, selectedOptionKey: ev.selectedOptionKey ?? null,
      };

      // 기존 기록을 지우지 않는다. 이벤트를 하나 더 붙일 뿐이다.
      const ledger = [entry, ...prev.ledger];
      return { ...prev, evaluations, ledger, policies: recountPolicies(prev.policies, ledger) };
    });
  }, []);

  const activatePolicy = useCallback((policyId: string) => {
    update((prev) => {
      const p = prev.policies.find((x) => x.id === policyId);
      if (!p || p.status !== 'CANDIDATE' || p.decisionCount < p.threshold) return prev;

      const at = new Date().toISOString();
      const policies = prev.policies.map((x) =>
        x.id === policyId
          ? { ...x, status: 'ACTIVE' as const, activatedBy: '박현우 · 팀 리드', activatedAt: at }
          : x);

      const entry: LedgerEntry = {
        id: `lg-p-${policyId}`,
        eventType: 'POLICY_ACTIVATED', outcome: null,
        actor: '박현우 · 팀 리드',
        title: `정책 등록 — ${p.title}`,
        summary: p.rule,
        occurredAt: at,
        evaluationId: null, ruleVersion: RULE_VERSION,
        patternKey: p.patternKey,
      };
      return { ...prev, policies, ledger: [entry, ...prev.ledger] };
    });
  }, []);

  const connect = useCallback((id: ConnectorId, accountLabel: string) => {
    update((prev) => {
      const at = new Date().toISOString();
      return {
        ...prev,
        connections: {
          ...prev.connections,
          [id]: { status: 'CONNECTED', accountLabel, connectedAt: at, lastSyncAt: at },
        },
      };
    });
  }, []);

  /**
   * 끊어도 지난 판정은 그대로 둔다. 그때는 실제로 그 근거를 보고 판정했기 때문이다.
   * 바뀌는 것은 다음 판정부터다.
   */
  const disconnect = useCallback((id: ConnectorId) => {
    update((prev) => ({
      ...prev,
      connections: {
        ...prev.connections,
        [id]: { status: 'DISCONNECTED', accountLabel: null, connectedAt: null, lastSyncAt: null },
      },
    }));
  }, []);

  const reset = useCallback(() => {
    update(() => seed());
  }, []);

  const value = useMemo<Store | null>(() => {
    if (!state) return null;
    return {
      now: state.now,
      scenarios,
      evaluations: state.evaluations,
      ledger: state.ledger,
      policies: state.policies,
      connections: state.connections,
      connected: new Set(
        (Object.keys(state.connections) as ConnectorId[])
          .filter((k) => state.connections[k].status === 'CONNECTED'),
      ),
      ruleVersion: RULE_VERSION,
      scenarioOf: (id) => scenarios.find((s) => s.id === id),
      evaluationOf: (id) => state.evaluations.find((e) => e.id === id),
      run, decide, revert, activatePolicy, connect, disconnect, reset,
    };
  }, [state, scenarios, run, decide, revert, activatePolicy, connect, disconnect, reset]);

  // 하이드레이션 전에는 뼈대만 보여준다. 문서의 Loading State 와 같은 자리다.
  if (!value) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-5 py-16 sm:px-10">
        <div className="h-3 w-28 animate-pulse bg-[var(--rule)]" />
        <div className="mt-6 h-10 w-2/3 animate-pulse bg-[var(--rule)]" />
        <div className="mt-10 space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse border border-[var(--rule)] bg-[var(--card-tint)]" />
          ))}
        </div>
      </div>
    );
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
