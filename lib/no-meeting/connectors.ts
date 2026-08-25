import type { ConnectionState, Connector, ConnectorId } from './types';

/**
 * 이 제품이 스스로 아는 사실은 하나도 없다. 아래 세 곳에서 읽어 온다.
 * 여기 서 있는 것은 전부 **판정 조건을 하나 이상 연다.** 아무것도 열지 않는 커넥터는
 * 두지 않는다 — 사람은 그 칸을 보고 "저걸 붙이면 판정이 나아지겠구나" 라고 읽는다.
 * 그래서 "무엇이 연결됐나" 가 "무엇을 판정할 수 있나" 와 같은 말이다.
 *
 * `live` 가 false 인 것은 아직 실물이 붙어 있지 않다. 화면에 그대로 밝힌다.
 */
export const CONNECTORS: Connector[] = [
  {
    id: 'teamsync',
    name: '세션 요약',
    vendor: '이 앱의 훅',
    role: '개발자가 별도 보고를 쓰지 않아도 되는 이유입니다. Claude Code 훅이 세션 요약을 자동으로 넣습니다.',
    reads: ['세션별 작업 요약(context)', '브랜치 병합 상태(branches)', '요약이 누구에게 흘러갔는지(injections)'],
    supplies: ['상태 근거', '최종 갱신 시각', '작업 소유자', '이미 전달됨'],
    required: true,
    scopes: ['이미 이 앱의 데이터입니다. 별도 권한이 없습니다.'],
    neverWrites: '읽기 전용으로만 조회합니다.',
    live: true,
  },
  {
    id: 'jira',
    name: '이슈트래커',
    vendor: 'Atlassian Jira',
    role: '"됐나요?" 의 답이 실제로 들어 있는 곳입니다. Task 단위로 셀 수 있는 유일한 소스입니다.',
    reads: ['이슈 상태와 완료 개수', '체크리스트 · 서브태스크', '결함 등급(P1 등)', '최종 갱신 시각'],
    supplies: ['Task 단위 상태', 'Prerequisite 충족', '잔존 P1'],
    required: false,
    scopes: ['이슈 읽기', '프로젝트 메타데이터 읽기'],
    neverWrites: '이슈 상태를 바꾸거나 코멘트를 남기지 않습니다.',
    live: true,
  },
  {
    id: 'alerts',
    name: '장애 알림',
    vendor: 'Sentry',
    role: '서버가 500을 뱉는 순간이 회의보다 먼저 도착합니다. 문제 해결 회의의 유일한 객관적 근거입니다. '
      + 'Sentry 를 직접 읽습니다 — 알림 채널을 거치지 않습니다.',
    reads: ['미해결 이슈와 누적 이벤트 수', '최종 발생 시각', '영향받은 사용자 수'],
    // 원인 후보는 여기서 오지 않는다. Sentry 는 "무슨 일이 났나" 를 주지
    // "원인 후보가 셋이다" 를 주지 않는다 — 그건 사람이 신청서에 적는다.
    supplies: ['증상 계측됨'],
    required: false,
    scopes: ['프로젝트 이슈 · 오류 이벤트 읽기'],
    neverWrites: '이슈를 resolve 하거나 코멘트를 남기지 않습니다.',
    live: true,
  },
];

export const CONNECTOR_BY_ID: Record<ConnectorId, Connector> =
  Object.fromEntries(CONNECTORS.map((c) => [c.id, c])) as Record<ConnectorId, Connector>;

/**
 * 초기 연결 상태 — `nm_connections` 에 행이 없을 때의 기본값.
 *
 * 세션 요약(훅)만 붙어 있다. 이 저장소의 테이블이라 인증이 필요 없기 때문이다.
 *
 * **이슈트래커와 알림은 끊긴 상태로 시작한다.** 예전에는 "데모 데이터" 라는 이름으로
 * 연결된 척했고, 그때는 코드에 하드코딩된 근거가 딸려 왔다. 그 근거를 지운 지금
 * 연결된 척을 유지하면 화면은 "연결됨" 이라고 하는데 판정에는 근거가 0건인 상태가 된다.
 * 이 제품에서 가장 나쁜 상태다 — 사람은 시스템이 봤다고 믿는데 실제로는 아무것도 안 봤다.
 */
export function seedConnections(now: number): Record<ConnectorId, ConnectionState> {
  const H = 3_600_000;
  const off: ConnectionState = {
    status: 'DISCONNECTED', accountLabel: null, connectedAt: null, lastSyncAt: null,
  };
  return {
    teamsync: {
      status: 'CONNECTED',
      accountLabel: '이 프로젝트',
      connectedAt: new Date(now - 24 * 30 * H).toISOString(),
      lastSyncAt: new Date(now - 0.02 * H).toISOString(),
    },
    jira: off,
    alerts: off,
  };
}

/**
 * 이 근거가 **끊길 수 있는 곳**에서 왔는가.
 * `POLICY`(우리 원장)와 `REQUEST`(신청자가 적어 낸 것)는 연결과 무관하므로 아니다.
 */
export function isConnectorSource(src: string): src is ConnectorId {
  return src in CONNECTOR_BY_ID;
}
