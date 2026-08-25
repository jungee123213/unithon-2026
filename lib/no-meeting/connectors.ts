import type { ConnectionState, Connector, ConnectorId } from './types';

/**
 * 이 제품이 스스로 아는 사실은 하나도 없다. 아래 다섯 곳에서 읽어 온다.
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
    id: 'calendar',
    name: '캘린더',
    vendor: 'Google Calendar',
    role: '이미 잡혀 있는 회의를 사후 판정합니다. 없어도 신청서로 큐가 채워집니다.',
    reads: ['예정된 회의의 제목 · 시각 · 길이', '참석 예정자 목록', '설명란의 안건', '이벤트 분류(1:1 · 브레인스토밍 등)'],
    supplies: ['회의 요청', '참석 예정 인원', '유형 표식'],
    required: false,
    scopes: ['캘린더 이벤트 읽기', '참석자 목록 읽기'],
    neverWrites: '일정을 만들거나 지우거나 초대를 보내지 않습니다.',
    live: false,
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
    live: false,
  },
  {
    id: 'github',
    name: '코드 저장소',
    vendor: 'GitHub',
    role: '브랜치 병합 여부처럼 사람 말보다 정확한 상태를 읽습니다.',
    reads: ['PR 상태 · 리뷰 승인', '브랜치 병합 여부', 'CODEOWNERS(관련자 판단)'],
    supplies: ['담당자 확정', '브랜치 병합 상태'],
    required: false,
    scopes: ['저장소 읽기', 'PR 읽기'],
    neverWrites: 'PR 을 머지하거나 코멘트를 남기지 않습니다.',
    live: false,
  },
  {
    id: 'alerts',
    name: '장애 알림',
    vendor: 'Sentry · Discord',
    role: '서버가 500을 뱉는 순간이 회의보다 먼저 도착합니다. 문제 해결 회의의 유일한 객관적 근거입니다.',
    reads: ['5xx · 예외 발생량과 추이', '알림 채널(#incident)에 뜬 장애 스레드', '영향 범위'],
    supplies: ['증상 계측됨'],
    required: false,
    scopes: ['프로젝트 이슈 · 오류 이벤트 읽기', '알림 채널 메시지 읽기'],
    neverWrites: '알림을 지우거나 채널에 글을 쓰지 않습니다.',
    live: false,
  },
];

export const CONNECTOR_BY_ID: Record<ConnectorId, Connector> =
  Object.fromEntries(CONNECTORS.map((c) => [c.id, c])) as Record<ConnectorId, Connector>;

/**
 * 초기 연결 상태.
 * 세션 요약(훅)은 이 저장소의 테이블이라 처음부터 붙어 있다 — 유일하게 실물이 있는 소스다.
 */
export function seedConnections(now: number): Record<ConnectorId, ConnectionState> {
  const H = 3_600_000;
  const on = (label: string, hoursAgo: number, syncedHoursAgo: number): ConnectionState => ({
    status: 'CONNECTED',
    accountLabel: label,
    connectedAt: new Date(now - hoursAgo * H).toISOString(),
    lastSyncAt: new Date(now - syncedHoursAgo * H).toISOString(),
  });
  const off: ConnectionState = {
    status: 'DISCONNECTED', accountLabel: null, connectedAt: null, lastSyncAt: null,
  };
  return {
    teamsync: on('이 프로젝트', 24 * 30, 0.02),
    calendar: off,
    jira: on('COMMERCE 프로젝트 (목업)', 24 * 12, 0.4),
    github: off,
    alerts: on('#incident · commerce-api (목업)', 24 * 6, 0.08),
  };
}
