'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import styles from '../dashboard-layout.module.css';
import { DASHBOARD_ROUTES, getDashboardRoute } from '../dashboard-routes';
import Button from './ui/Button';

const POS_PATH = '/pos';

// Dashboard의 모든 query key는 ['dashboard', ...] namespace를 쓴다
// (overview/sales/products/inventory/alerts). prefix 하나만 무효화하면
// 현재 화면에 마운트된 query가 전부 재조회되고, 마운트되지 않은 query는
// stale로만 표시돼 다음 진입 시 다시 불러온다.
const DASHBOARD_QUERY_NAMESPACE = ['dashboard'];

// 캐시가 즉시 응답하면 스피너가 한 프레임만 보였다 사라져 눌린 건지
// 알 수 없다. 최소 이 시간만큼은 진행 상태를 유지해 피드백을 남긴다.
const MIN_SYNC_FEEDBACK_MS = 400;

// 상단바 시계·최종 동기화 시각의 기준 timezone. Dashboard의 다른 시각
// 표시(sales-data.js/overview-data.js/alerts-data.js)와 동일하게 KST로
// 고정해, 브라우저 기본 timezone과 무관하게 매장 기준 시각을 보여준다.
const TOPBAR_TIMEZONE = 'Asia/Seoul';

// 시계가 마운트되기 전(SSR·hydration 시점) 자리를 지키는 문자열.
const TOPBAR_CLOCK_PLACEHOLDER = '—';

// 시각 포맷터는 Dashboard의 다른 포맷터와 같은 규칙을 따른다: 명시적
// timeZone + 명시적 locale('ko-KR') + formatToParts 직접 조립으로 브라우저
// 기본 locale의 구두점에 기대지 않는다. 다만 hour12: false 대신
// hourCycle: 'h23'을 쓴다 — ko-KR + hour12: false는 자정을 '24'시로
// 표기하는 ICU 동작이 있어, 매초 갱신되는 시계에서는 그대로 드러난다.
function formatTopbarParts(date, options) {
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: TOPBAR_TIMEZONE,
    hourCycle: 'h23',
    ...options,
  });
  return Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
}

// "2026-08-28 (금) 15:04:12" 형식의 실시간 시각.
function formatTopbarClock(date) {
  const parts = formatTopbarParts(date, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return `${parts.year}-${parts.month}-${parts.day} (${parts.weekday}) ${parts.hour}:${parts.minute}:${parts.second}`;
}

// "15:04:12" 형식의 최종 동기화 시각. 오늘 안에서만 의미가 있는 값이라
// 날짜는 생략하고 시:분:초만 배지에 넣는다.
function formatTopbarTime(date) {
  const parts = formatTopbarParts(date, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return `${parts.hour}:${parts.minute}:${parts.second}`;
}

// 최종 동기화 시각은 별도로 기록하지 않고 React Query 캐시에서 읽는다 —
// 동기화 버튼뿐 아니라 최초 진입 시의 조회, 각 페이지의 개별 무효화까지
// 전부 반영돼야 "데이터가 마지막으로 갱신된 시점"이 정확해지기 때문이다.
// 아직 아무 데이터도 도착하지 않았으면(dataUpdatedAt === 0) null.
function readLastSyncedAt(queryClient) {
  const updatedAtList = queryClient
    .getQueryCache()
    .findAll({ queryKey: DASHBOARD_QUERY_NAMESPACE })
    .map((query) => query.state.dataUpdatedAt)
    .filter((updatedAt) => updatedAt > 0);
  return updatedAtList.length > 0 ? Math.max(...updatedAtList) : null;
}

export default function DashboardTopbar() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  // 서버 렌더링 결과에 시각이 섞이면 hydration 불일치가 나므로, 두 값 모두
  // null로 시작해 마운트 이후 effect에서만 채운다. 서버와 클라이언트의 첫
  // 렌더는 항상 placeholder로 일치한다.
  const [now, setNow] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const currentRoute = getDashboardRoute(pathname);
  const title = currentRoute?.label ?? DASHBOARD_ROUTES.overview.label;

  // 1초 tick 하나로 시계와 최종 동기화 배지를 함께 갱신한다. 캐시 읽기를
  // render가 아니라 이 effect에서 하는 이유는 render를 순수하게 유지하기
  // 위해서다. 같은 tick의 두 setState는 React가 한 번의 렌더로 배칭한다.
  useEffect(() => {
    const tick = () => {
      setNow(new Date());
      setLastSyncedAt(readLastSyncedAt(queryClient));
    };
    tick();
    const timerId = setInterval(tick, 1000);
    return () => clearInterval(timerId);
  }, [queryClient]);

  const openStaffPos = () => {
    window.open(POS_PATH, '_blank', 'noopener,noreferrer');
  };

  const syncDashboardData = async () => {
    if (isSyncing) {
      return;
    }
    setIsSyncing(true);
    try {
      await Promise.all([
        // 재조회가 실패해도 각 페이지가 자체 error 상태로 이미 표시하므로
        // 여기서는 삼키고 버튼 상태만 정상적으로 되돌린다.
        queryClient
          .invalidateQueries({ queryKey: DASHBOARD_QUERY_NAMESPACE })
          .catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, MIN_SYNC_FEEDBACK_MS)),
      ]);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <header className={styles.topbar}>
      <div className={styles.topbarHeading}>
        <div className={styles.topbarTitle}>{title}</div>
        <div className={styles.topbarSubtitle}>
          {now ? formatTopbarClock(now) : TOPBAR_CLOCK_PLACEHOLDER}
        </div>
      </div>
      <div className={styles.topbarActions}>
        {/* 최초 조회가 끝나기 전에는 표시할 시각 자체가 없으므로 대기 문구를
            둔다 — 이 상태가 SSR·hydration 시점의 렌더 결과이기도 하다. */}
        <div className={styles.topbarStatus}>
          <span className={styles.topbarStatusDot} aria-hidden="true" />
          {lastSyncedAt
            ? `최종 동기화 ${formatTopbarTime(new Date(lastSyncedAt))}`
            : '동기화 대기'}
        </div>
        {/* 동기화 중에는 중복 요청을 막기 위해 disabled로 두고,
            아이콘 회전 + 라벨 변경으로 진행 상태를 알린다. */}
        <Button
          variant="secondary"
          leadingIcon={
            <RefreshCw
              aria-hidden="true"
              className={isSyncing ? styles.topbarSyncSpinner : undefined}
            />
          }
          onClick={syncDashboardData}
          disabled={isSyncing}
          aria-busy={isSyncing}
        >
          {isSyncing ? '동기화 중…' : '데이터 동기화'}
        </Button>
        {/* 직원 POS는 대시보드와 별도 화면에서 운영하므로 새 창/탭으로 띄운다.
            noopener,noreferrer로 열어 새 창이 window.opener를 참조하지 못하게 한다. */}
        <Button variant="primary" onClick={openStaffPos}>
          직원 POS 열기 ↗
        </Button>
      </div>
    </header>
  );
}
