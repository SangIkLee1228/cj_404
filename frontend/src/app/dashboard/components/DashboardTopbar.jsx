'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import styles from '../dashboard-layout.module.css';
import { DASHBOARD_ROUTES, getDashboardRoute } from '../dashboard-routes';
import Button from './ui/Button';

const SYNC_SUCCESS_MESSAGE = '데이터 동기화가 완료되었습니다.';
const SYNC_ERROR_MESSAGE = '데이터 동기화에 실패했습니다. 다시 시도해주세요.';

const POS_PATH = '/pos';

export default function DashboardTopbar() {
  const pathname = usePathname();
  const currentRoute = getDashboardRoute(pathname);
  const title = currentRoute?.label ?? DASHBOARD_ROUTES.overview.label;

  // 기존 DashboardQueryProvider의 QueryClient를 그대로 쓴다 — 새
  // QueryClient/Provider를 만들지 않는다.
  const queryClient = useQueryClient();
  // idle → syncing → success | error. 타이머로 자동 초기화하지 않는다 —
  // 다음 동기화 클릭이 상태를 자연스럽게 다시 바꾼다.
  const [syncStatus, setSyncStatus] = useState('idle');
  const isSyncing = syncStatus === 'syncing';
  const syncMessage =
    syncStatus === 'success'
      ? SYNC_SUCCESS_MESSAGE
      : syncStatus === 'error'
        ? SYNC_ERROR_MESSAGE
        : null;

  // 현재 화면에서 실제 구독 중인(active) ['dashboard', ...] query만 즉시
  // 다시 GET한다. 비활성 query(다른 페이지의 목록 등)는 stale로만
  // 표시되고, 해당 페이지에 다시 들어갈 때 자연스럽게 재조회된다 —
  // sidebar unread-count는 항상 마운트돼 있는 active query라 이 클릭
  // 만으로 즉시 갱신된다. 캐시를 직접 patch(setQueryData)하지 않는다.
  async function handleSyncClick() {
    if (isSyncing) {
      return;
    }
    setSyncStatus('syncing');
    try {
      await queryClient.invalidateQueries(
        { queryKey: ['dashboard'], refetchType: 'active' },
        { throwOnError: true }
      );
      setSyncStatus('success');
    } catch {
      // 서버 오류 원문·stack·응답 본문은 노출하지 않는다.
      setSyncStatus('error');
    }
  }

  // 클릭 handler 안에서 동기적으로 직접 호출한다 — 비동기 처리 뒤에
  // 호출하면 브라우저가 팝업 차단으로 간주할 수 있다. 현재 서비스
  // origin 기준 상대 경로만 쓰고, 절대 URL/localhost를 하드코딩하지
  // 않는다. noopener/noreferrer로 새 탭이 window.opener를 통해 이
  // Dashboard 탭을 조작하지 못하게 막는다(reverse tabnabbing 방지).
  function handlePosOpenClick() {
    window.open(POS_PATH, '_blank', 'noopener,noreferrer');
  }

  return (
    <header className={styles.topbar}>
      <div className={styles.topbarHeading}>
        <div className={styles.topbarTitle}>{title}</div>
        {/* 실시간 시계는 이후 단계에서 별도 Client Component로 분리해 연결한다.
            hydration 불일치를 피하기 위해 지금은 new Date를 직접 렌더링하지 않는다. */}
        <div className={styles.topbarSubtitle}>실시간 시각 연동 예정</div>
      </div>
      <div className={styles.topbarActions}>
        <div className={styles.topbarStatus}>
          <span className={styles.topbarStatusDot} aria-hidden="true" />
          POS 연결 대기
        </div>
        <Button
          variant="secondary"
          leadingIcon={
            <RefreshCw
              aria-hidden="true"
              className={isSyncing ? styles.topbarSyncIconSpinning : undefined}
            />
          }
          disabled={isSyncing}
          aria-busy={isSyncing}
          onClick={handleSyncClick}
        >
          {isSyncing ? '동기화 중…' : '데이터 동기화'}
        </Button>
        {syncMessage ? (
          syncStatus === 'error' ? (
            <span
              className={`${styles.topbarSyncMessage} ${styles.topbarSyncMessageError}`}
              role="alert"
            >
              {syncMessage}
            </span>
          ) : (
            <span
              className={`${styles.topbarSyncMessage} ${styles.topbarSyncMessageSuccess}`}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {syncMessage}
            </span>
          )
        ) : null}
        <Button
          variant="primary"
          onClick={handlePosOpenClick}
          aria-label="직원 POS 새 탭에서 열기"
        >
          직원 POS 열기 ↗
        </Button>
      </div>
    </header>
  );
}
