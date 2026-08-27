'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Info, Bell } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import SegmentedControl from '../components/ui/SegmentedControl';
import TableCard from '../components/ui/TableCard';
import StatusBadge from '../components/ui/StatusBadge';
import Button from '../components/ui/Button';
import dashboardLayoutStyles from '../dashboard-layout.module.css';
import styles from './alerts.module.css';
import {
  READ_STATUS_FILTER_OPTIONS,
  NOTIFICATION_SEVERITY_FILTER_OPTIONS,
  DEFAULT_ALERTS_QUERY,
  buildNotificationsApiQuery,
  mapNotificationsResponseToPageInfo,
  getNotificationSeverityMeta,
  formatNotificationDateTime,
} from './alerts-data';
import {
  alertsQueryKeys,
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../api/alerts-api';

// getNotificationSeverityMeta(alerts-data.js, React 없는 순수 데이터 파일)가
// 돌려주는 아이콘 이름 문자열 → 실제 lucide-react 컴포넌트 매핑. 알 수
// 없는 이름이 오더라도 화면이 깨지지 않도록 Bell을 fallback으로 둔다.
const NOTIFICATION_SEVERITY_ICON = { AlertTriangle, Info, Bell };

// iconTone('out'/'warning'/'info'/'neutral') → alerts.module.css 클래스.
const NOTIFICATION_ICON_TONE_CLASS = {
  out: 'alertIconOut',
  warning: 'alertIconWarning',
  info: 'alertIconInfo',
  neutral: 'alertIconNeutral',
};

export default function AlertsPageContent() {
  const queryClient = useQueryClient();
  const [queryState, setQueryState] = useState(DEFAULT_ALERTS_QUERY);

  // 목록 query. normalizedQuery(=buildNotificationsApiQuery 결과)를
  // queryKey에 그대로 실어 읽음 상태·알림 수준·페이지 조합마다 별도로
  // 캐시된다. Foundation의 retry/refetchOnWindowFocus 기본 정책을 그대로
  // 쓴다(별도 옵션을 지정하지 않는다).
  const normalizedQuery = buildNotificationsApiQuery(queryState);
  const alertsQuery = useQuery({
    queryKey: alertsQueryKeys.list(normalizedQuery),
    queryFn: ({ signal }) => fetchNotifications(queryState, { signal }),
  });
  const pageInfo = alertsQuery.isSuccess
    ? mapNotificationsResponseToPageInfo(alertsQuery.data)
    : null;

  // 개별 읽음(PATCH /notifications/{id}/read) mutation.
  const markOneMutation = useMutation({
    mutationFn: (notificationId) => markNotificationRead(notificationId),
  });
  // 전체 읽음(PATCH /notifications/read-all) mutation.
  const markAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
  });
  const isAnyMutationPending =
    markOneMutation.isPending || markAllMutation.isPending;

  // 단건/전체 오류 문구를 구분해서 보여준다. 서버 원문은 노출하지 않는다.
  const mutationErrorMessage = markOneMutation.isError
    ? '알림 읽음 처리에 실패했습니다. 다시 시도해주세요.'
    : markAllMutation.isError
      ? '전체 읽음 처리에 실패했습니다. 다시 시도해주세요.'
      : null;

  // mutation(개별/전체 읽음) 진행 중에는 필터·페이지 이동을 막는다 —
  // mutation의 onSuccess가 이전 pageInfo 기준으로 page를 옮기는 도중
  // 사용자가 다른 필터로 전환하면, 그 이동이 이미 바뀐 필터의 page를
  // 덮어써 잘못된 offset으로 이어질 수 있다.
  function handleReadStatusChange(readStatus) {
    if (isAnyMutationPending) {
      return;
    }
    setQueryState((prev) => ({ ...prev, readStatus, page: 1 }));
  }

  function handleSeverityChange(severity) {
    if (isAnyMutationPending) {
      return;
    }
    setQueryState((prev) => ({ ...prev, severity, page: 1 }));
  }

  function handlePreviousPage() {
    if (isAnyMutationPending || !pageInfo) {
      return;
    }
    setQueryState((prev) => ({
      ...prev,
      page: Math.max(1, pageInfo.currentPage - 1),
    }));
  }

  function handleNextPage() {
    if (isAnyMutationPending || !pageInfo) {
      return;
    }
    setQueryState((prev) => ({
      ...prev,
      page: Math.min(pageInfo.totalPages, pageInfo.currentPage + 1),
    }));
  }

  // 개별 읽음 처리. optimistic update/setQueryData는 쓰지 않는다 — 성공
  // 후 alerts namespace를 invalidate해 실제 GET으로 목록·unread_count·
  // summary를 다시 조회한다.
  //
  // UNREAD 필터에서 현재 페이지(2페이지 이상)에 항목이 1개뿐인 상태로
  // 그 항목을 읽음 처리하면, 그 offset은 더 이상 유효하지 않게 된다(총
  // 개수가 offset보다 작아짐 — 1/3에서 확인된 backend PGRST103 500과
  // 동일한 조건). 그 offset을 그대로 다시 GET하지 않도록, namespace는
  // stale로만 표시하고(refetchType: 'none') 즉시 이전 페이지로
  // queryState.page를 옮겨 그 페이지의 유효한 offset으로 GET이 실행되게
  // 한다.
  function handleMarkOneRead(notificationId) {
    if (isAnyMutationPending) {
      return;
    }
    // 새 mutation을 시작하기 전, 다른 mutation(전체 읽음)의 이전 오류를
    // 화면에 남겨두지 않는다.
    markAllMutation.reset();

    const shouldStepBackPage =
      queryState.readStatus === 'UNREAD' &&
      Boolean(pageInfo) &&
      pageInfo.currentPage > 1 &&
      pageInfo.items.length === 1;

    markOneMutation.mutate(notificationId, {
      onSuccess: () => {
        if (shouldStepBackPage) {
          queryClient.invalidateQueries({
            queryKey: alertsQueryKeys.all,
            refetchType: 'none',
          });
          setQueryState((prev) => ({
            ...prev,
            page: Math.max(1, pageInfo.currentPage - 1),
          }));
        } else {
          queryClient.invalidateQueries({ queryKey: alertsQueryKeys.all });
        }
      },
    });
  }

  // 전체 읽음 처리. UNREAD 필터에서 2페이지 이상을 보고 있었다면, 전체
  // 읽음 처리 후 그 offset은 더 이상 유효하지 않다(UNREAD 총 개수가
  // 0이 됨) — 그 잘못된 offset을 그대로 다시 GET하지 않도록 namespace를
  // stale로만 표시하고 1페이지(offset=0, 항상 유효)로 옮긴다. 이미
  // 1페이지였다면 offset=0은 결과가 0건이어도 정상 200이므로 그냥
  // invalidate해 다시 조회한다.
  function handleMarkAllRead() {
    if (isAnyMutationPending) {
      return;
    }
    markOneMutation.reset();

    const isUnreadFilterBeyondFirstPage =
      queryState.readStatus === 'UNREAD' &&
      Boolean(pageInfo) &&
      pageInfo.currentPage > 1;

    markAllMutation.mutate(undefined, {
      onSuccess: () => {
        if (isUnreadFilterBeyondFirstPage) {
          queryClient.invalidateQueries({
            queryKey: alertsQueryKeys.all,
            refetchType: 'none',
          });
          setQueryState((prev) => ({ ...prev, page: 1 }));
        } else {
          queryClient.invalidateQueries({ queryKey: alertsQueryKeys.all });
        }
      },
    });
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
            disabled={
              !pageInfo || pageInfo.unreadCount === 0 || isAnyMutationPending
            }
            onClick={handleMarkAllRead}
            aria-label="모든 알림 읽음 처리"
          >
            {markAllMutation.isPending ? '처리 중…' : '모두 읽음 처리'}
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
              disabled={isAnyMutationPending}
            />
            <span className={styles.filterDivider} aria-hidden="true" />
            <span className={styles.filterGroupLabel} aria-hidden="true">
              알림 수준
            </span>
            <SegmentedControl
              aria-label="알림 수준 필터"
              items={NOTIFICATION_SEVERITY_FILTER_OPTIONS}
              value={queryState.severity}
              onValueChange={handleSeverityChange}
              disabled={isAnyMutationPending}
            />
          </div>
          {mutationErrorMessage ? (
            <p className={styles.mutationError} role="alert">
              {mutationErrorMessage}
            </p>
          ) : null}
          <TableCard
            title="알림 목록"
            headerMeta={
              pageInfo ? (
                <span aria-live="polite">
                  {`총 ${pageInfo.total}개 · 안읽음 ${pageInfo.unreadCount}개`}
                </span>
              ) : null
            }
          >
            {alertsQuery.isPending ? (
              <p
                className={styles.tableEmpty}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                알림 목록을 불러오는 중입니다.
              </p>
            ) : alertsQuery.isError ? (
              <>
                <p className={styles.tableEmpty} role="alert">
                  알림 목록을 불러오지 못했습니다.
                </p>
                <div className={styles.stateActions}>
                  <Button onClick={() => alertsQuery.refetch()}>
                    다시 시도
                  </Button>
                </div>
              </>
            ) : pageInfo.total === 0 ? (
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
                    const severityMeta = getNotificationSeverityMeta(
                      item.severity
                    );
                    const TypeIcon =
                      NOTIFICATION_SEVERITY_ICON[severityMeta.iconName] ?? Bell;
                    const isMarkingThisOne =
                      markOneMutation.isPending &&
                      markOneMutation.variables === item.notification_id;
                    const rowClassName = [
                      styles.alertRow,
                      item.is_read ? null : styles.alertRowUnread,
                    ]
                      .filter(Boolean)
                      .join(' ');
                    const iconClassName = [
                      styles.alertIcon,
                      styles[
                        NOTIFICATION_ICON_TONE_CLASS[severityMeta.iconTone]
                      ],
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
                            {severityMeta.badgeStatus ? (
                              <StatusBadge status={severityMeta.badgeStatus}>
                                {severityMeta.label}
                              </StatusBadge>
                            ) : (
                              <span className={styles.typeLabelNeutral}>
                                {severityMeta.label}
                              </span>
                            )}
                          </div>
                          <p className={styles.alertMessage}>{item.message}</p>
                          <div className={styles.alertMeta}>
                            {item.product_name ? (
                              <span>{item.product_name}</span>
                            ) : null}
                            {typeof item.remaining_qty_snapshot === 'number' ? (
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
                              disabled={isAnyMutationPending}
                              onClick={() =>
                                handleMarkOneRead(item.notification_id)
                              }
                              aria-label={`${item.title} 읽음 처리`}
                            >
                              {isMarkingThisOne ? '처리 중…' : '읽음 처리'}
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
                      disabled={
                        !pageInfo.hasPreviousPage || isAnyMutationPending
                      }
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
                      disabled={!pageInfo.hasNextPage || isAnyMutationPending}
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
