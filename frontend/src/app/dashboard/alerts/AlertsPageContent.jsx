'use client';

import { useState } from 'react';
import { AlertTriangle, Info, Bell } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import SegmentedControl from '../components/ui/SegmentedControl';
import TableCard from '../components/ui/TableCard';
import StatusBadge from '../components/ui/StatusBadge';
import Button from '../components/ui/Button';
import dashboardLayoutStyles from '../dashboard-layout.module.css';
import styles from './alerts.module.css';
import {
  DEFAULT_ALERTS_QUERY,
  queryMockNotifications,
  mapNotificationsResponseToPageInfo,
  getNotificationTypeMeta,
  formatNotificationDateTime,
} from './alerts-data';
import {
  ALERTS_MOCK_NOTIFICATIONS,
  READ_STATUS_FILTER_OPTIONS,
  NOTIFICATION_TYPE_FILTER_OPTIONS,
} from './alerts-mock-data';

// getNotificationTypeMeta(alerts-data.js, React 없는 순수 데이터 파일)가
// 돌려주는 아이콘 이름 문자열 → 실제 lucide-react 컴포넌트 매핑. 알 수
// 없는 이름이 오더라도 화면이 깨지지 않도록 Bell을 fallback으로 둔다.
const NOTIFICATION_TYPE_ICON = { AlertTriangle, Info, Bell };

export default function AlertsPageContent() {
  // 알림 목록 자체를 화면 state로 들고 있다 — 개별/전체 읽음 처리가 실제
  // API 호출 없이 이 state만 immutable하게 바꾼다(Mock, PATCH 없음).
  const [notifications, setNotifications] = useState(ALERTS_MOCK_NOTIFICATIONS);
  const [queryState, setQueryState] = useState(DEFAULT_ALERTS_QUERY);

  // 목록·페이지 메타 모두 이 파일이 아니라 alerts-data.js의 순수 함수
  // 반환값을 그대로 옮길 뿐, 이 컴포넌트에서 filter/sort/slice나 개수
  // 집계를 직접 계산하지 않는다. 요청 page가 필터 결과보다 크면
  // queryMockNotifications가 스스로 유효한 페이지로 보정한다.
  const notificationsResponse = queryMockNotifications(
    notifications,
    queryState
  );
  const pageInfo = mapNotificationsResponseToPageInfo(notificationsResponse);

  function handleReadStatusChange(readStatus) {
    setQueryState((prev) => ({ ...prev, readStatus, page: 1 }));
  }

  function handleNotificationTypeChange(notificationType) {
    setQueryState((prev) => ({ ...prev, notificationType, page: 1 }));
  }

  // 이전/다음은 queryState.page가 아니라 pageInfo.currentPage(이미
  // queryMockNotifications가 보정한 값)를 기준으로 계산한다 — 읽음 처리로
  // 필터 결과가 줄어 현재 페이지가 자동으로 당겨진 뒤에도 다음 클릭이
  // 항상 실제로 보이는 페이지 기준으로 동작하게 하기 위함이다.
  function handlePreviousPage() {
    setQueryState((prev) => ({
      ...prev,
      page: Math.max(1, pageInfo.currentPage - 1),
    }));
  }

  function handleNextPage() {
    setQueryState((prev) => ({
      ...prev,
      page: Math.min(pageInfo.totalPages, pageInfo.currentPage + 1),
    }));
  }

  // 개별 읽음 처리: 해당 notification_id만 immutable하게 is_read: true로
  // 바꾼다. 다른 알림은 건드리지 않고, queryState.page도 임의로 되돌리지
  // 않는다(필터 결과가 줄어 마지막 페이지가 사라지는 보정은
  // queryMockNotifications가 담당).
  function handleMarkOneRead(notificationId) {
    setNotifications((prev) =>
      prev.map((item) =>
        item.notification_id === notificationId
          ? { ...item, is_read: true }
          : item
      )
    );
  }

  // 모두 읽음 처리: 현재 Mock state의 모든 미읽음 항목만 immutable하게
  // is_read: true로 바꾼다. 실제 PATCH 요청은 없다.
  function handleMarkAllRead() {
    setNotifications((prev) =>
      prev.map((item) => (item.is_read ? item : { ...item, is_read: true }))
    );
  }

  return (
    <section className={dashboardLayoutStyles.page}>
      <PageHeader
        title="알림"
        description="재고 및 운영 관련 알림을 확인합니다."
        actions={
          <Button
            type="button"
            variant="primary"
            disabled={pageInfo.unreadCount === 0}
            onClick={handleMarkAllRead}
            aria-label="모든 알림 읽음 처리"
          >
            모두 읽음 처리
          </Button>
        }
      />
      <div className={dashboardLayoutStyles.pageContent}>
        <div className={styles.contentStack}>
          <div className={styles.filters}>
            <span className={styles.filterGroupLabel} aria-hidden="true">
              읽음 상태
            </span>
            <SegmentedControl
              aria-label="읽음 상태 필터"
              items={READ_STATUS_FILTER_OPTIONS}
              value={queryState.readStatus}
              onValueChange={handleReadStatusChange}
            />
            <span className={styles.filterDivider} aria-hidden="true" />
            <span className={styles.filterGroupLabel} aria-hidden="true">
              알림 유형
            </span>
            <SegmentedControl
              aria-label="알림 유형 필터"
              items={NOTIFICATION_TYPE_FILTER_OPTIONS}
              value={queryState.notificationType}
              onValueChange={handleNotificationTypeChange}
            />
          </div>
          <TableCard
            title="알림 목록"
            headerMeta={
              <span aria-live="polite">
                {`총 ${pageInfo.total}개 · 안읽음 ${pageInfo.unreadCount}개`}
              </span>
            }
          >
            {pageInfo.total === 0 ? (
              <p
                className={styles.tableEmpty}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                선택한 조건에 해당하는 알림이 없습니다.
              </p>
            ) : (
              <>
                <ul className={styles.alertList}>
                  {pageInfo.items.map((item) => {
                    const typeMeta = getNotificationTypeMeta(item.notif_type);
                    const TypeIcon =
                      NOTIFICATION_TYPE_ICON[typeMeta.iconName] ?? Bell;
                    const rowClassName = [
                      styles.alertRow,
                      item.is_read ? null : styles.alertRowUnread,
                    ]
                      .filter(Boolean)
                      .join(' ');
                    const iconClassName = [
                      styles.alertIcon,
                      typeMeta.tone === 'warning'
                        ? styles.alertIconWarning
                        : typeMeta.tone === 'info'
                          ? styles.alertIconInfo
                          : styles.alertIconNeutral,
                    ]
                      .filter(Boolean)
                      .join(' ');

                    return (
                      <li key={item.notification_id} className={rowClassName}>
                        <div className={iconClassName} aria-hidden="true">
                          <TypeIcon aria-hidden="true" size={18} />
                        </div>
                        <div className={styles.alertBody}>
                          <div className={styles.alertTitleRow}>
                            {!item.is_read ? (
                              <span
                                className={styles.unreadDot}
                                aria-hidden="true"
                              />
                            ) : null}
                            <span className={styles.alertTitle}>
                              {!item.is_read ? (
                                <span className={styles.srOnly}>
                                  읽지 않음,{' '}
                                </span>
                              ) : null}
                              {item.title}
                            </span>
                            {typeMeta.tone === 'warning' ? (
                              <StatusBadge status="low">
                                {typeMeta.label}
                              </StatusBadge>
                            ) : (
                              <span className={styles.typeLabelNeutral}>
                                {typeMeta.label}
                              </span>
                            )}
                          </div>
                          <p className={styles.alertMessage}>{item.message}</p>
                          <div className={styles.alertMeta}>
                            {item.product_name ? (
                              <span>{item.product_name}</span>
                            ) : null}
                            {item.notif_type === 'STOCK_LOW' &&
                            typeof item.remaining_qty_snapshot === 'number' ? (
                              <span>{`추정 ${item.remaining_qty_snapshot}개`}</span>
                            ) : null}
                            <span className={styles.alertTime}>
                              {formatNotificationDateTime(item.created_at)}
                            </span>
                          </div>
                        </div>
                        <div className={styles.alertAction}>
                          {!item.is_read ? (
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() =>
                                handleMarkOneRead(item.notification_id)
                              }
                              aria-label={`${item.title} 읽음 처리`}
                            >
                              읽음 처리
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <nav
                  className={styles.paginationFooter}
                  aria-label="알림 목록 페이지네이션"
                >
                  <span className={styles.paginationCount}>
                    {`총 ${pageInfo.total}개 중 ${pageInfo.rangeStart}-${pageInfo.rangeEnd}`}
                  </span>
                  <div className={styles.paginationNav}>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!pageInfo.hasPreviousPage}
                      onClick={handlePreviousPage}
                      aria-label="이전 알림 목록 페이지"
                    >
                      이전
                    </Button>
                    <span
                      className={styles.paginationPageText}
                      aria-live="polite"
                    >
                      {`${pageInfo.currentPage} / ${pageInfo.totalPages}페이지`}
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!pageInfo.hasNextPage}
                      onClick={handleNextPage}
                      aria-label="다음 알림 목록 페이지"
                    >
                      다음
                    </Button>
                  </div>
                </nav>
              </>
            )}
          </TableCard>
        </div>
      </div>
    </section>
  );
}
