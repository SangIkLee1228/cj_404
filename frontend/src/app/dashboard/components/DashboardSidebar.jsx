'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Package,
  Tag,
  BarChart3,
  Bell,
  LogOut,
} from 'lucide-react';
import styles from '../dashboard-layout.module.css';
import { DASHBOARD_ROUTES, isRouteActive } from '../dashboard-routes';
import {
  alertsQueryKeys,
  fetchUnreadNotificationCount,
} from '../api/alerts-api';

// Lucide는 outline(stroke) 아이콘만 제공한다. 각 아이콘의 stroke 구조상
// 자연스러운 filled 형태가 없어, 의미가 유지되는 선에서 직접 그린 단순한
// filled 버전이다(목업 SVG를 그대로 복사하지 않음).
function OverviewIconFilled(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <rect width="7" height="9" x="3" y="3" rx="1.5" />
      <rect width="7" height="5" x="14" y="3" rx="1.5" />
      <rect width="7" height="9" x="14" y="12" rx="1.5" />
      <rect width="7" height="5" x="3" y="16" rx="1.5" />
    </svg>
  );
}

function InventoryIconFilled(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
    </svg>
  );
}

function ProductIconFilled(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42zM7.5 6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"
      />
    </svg>
  );
}

function SalesIconFilled(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <rect x="4" y="13" width="3.4" height="7" rx="1.2" />
      <rect x="10.3" y="6" width="3.4" height="14" rx="1.2" />
      <rect x="16.6" y="10" width="3.4" height="10" rx="1.2" />
    </svg>
  );
}

function AlertIconFilled(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326Z" />
      <circle cx="12" cy="20.1" r="1.1" />
    </svg>
  );
}

// outline/filled 두 벌을 같은 자리에 겹쳐 두고 CSS([data-active] 선택자)로만
// 표시 상태를 전환한다. data-active 값만 바뀌면 아이콘도 함께 전환된다.
function NavIcon({ Icon, FilledIcon }) {
  return (
    <span className={styles.navIcon} aria-hidden="true">
      <Icon className={styles.iconOutline} />
      <FilledIcon className={styles.iconFilled} />
    </span>
  );
}

const NAV_ENTRIES = [
  {
    type: 'item',
    ...DASHBOARD_ROUTES.overview,
    Icon: LayoutDashboard,
    FilledIcon: OverviewIconFilled,
  },
  { type: 'label', label: 'OPERATIONS' },
  {
    type: 'item',
    ...DASHBOARD_ROUTES.inventory,
    Icon: Package,
    FilledIcon: InventoryIconFilled,
  },
  {
    type: 'item',
    ...DASHBOARD_ROUTES.products,
    Icon: Tag,
    FilledIcon: ProductIconFilled,
  },
  { type: 'label', label: 'ANALYTICS' },
  {
    type: 'item',
    ...DASHBOARD_ROUTES.sales,
    Icon: BarChart3,
    FilledIcon: SalesIconFilled,
  },
];

// API 연결 전 Dashboard UI 확인용 목업 데이터다.
// 실제 인증 또는 매장 데이터가 연결되면 교체 예정이다.
const STORE_NAME = '뚜레쥬르 강남 직영점';
const MANAGER_NAME = '김철수';

export default function DashboardSidebar() {
  const pathname = usePathname();
  const alertsActive = isRouteActive(pathname, DASHBOARD_ROUTES.alerts.href);

  // 사이드바 배지 전용 조회 — 목록을 받아 프론트에서 집계하지 않고
  // GET /api/notifications/unread-count 값을 그대로 쓴다. Foundation
  // 기본 retry/refetchOnWindowFocus 정책을 그대로 쓴다(별도 옵션 지정
  // 없음).
  const unreadCountQuery = useQuery({
    queryKey: alertsQueryKeys.unreadCount(),
    queryFn: ({ signal }) => fetchUnreadNotificationCount({ signal }),
  });
  const unreadCount = unreadCountQuery.isSuccess
    ? unreadCountQuery.data.unread_count
    : 0;
  // 로딩 중이거나 오류가 나면 배지만 숨긴다 — 사이드바·링크·라우팅은
  // 그대로 유지하고 별도의 로딩/오류 문구를 추가하지 않는다.
  const showUnreadBadge = unreadCountQuery.isSuccess && unreadCount > 0;
  const unreadBadgeText = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logoArea}>
        <Image
          src="/dashboard/logo.png"
          alt="뚜레쥬르"
          width={154}
          height={22}
          className={styles.logoImage}
          priority
        />
      </div>
      <nav className={styles.nav} aria-label="대시보드 메뉴">
        <ul className={styles.navList}>
          {NAV_ENTRIES.map((entry) => {
            if (entry.type === 'label') {
              return (
                <li key={entry.label} className={styles.navSectionLabel}>
                  {entry.label}
                </li>
              );
            }

            const active = isRouteActive(pathname, entry.href);

            return (
              <li key={entry.href}>
                <Link
                  href={entry.href}
                  className={styles.navItem}
                  data-active={active ? 'true' : undefined}
                  aria-current={active ? 'page' : undefined}
                >
                  <NavIcon Icon={entry.Icon} FilledIcon={entry.FilledIcon} />
                  <span>{entry.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className={styles.sidebarBottom}>
        <div className={styles.sidebarAlerts}>
          <Link
            href={DASHBOARD_ROUTES.alerts.href}
            className={styles.navItem}
            data-active={alertsActive ? 'true' : undefined}
            aria-current={alertsActive ? 'page' : undefined}
          >
            <NavIcon Icon={Bell} FilledIcon={AlertIconFilled} />
            <span>{DASHBOARD_ROUTES.alerts.label}</span>
            {showUnreadBadge ? (
              <span
                className={styles.sidebarAlertBadge}
                aria-live="polite"
                aria-label={`읽지 않은 알림 ${unreadCount}개`}
              >
                {unreadBadgeText}
              </span>
            ) : null}
          </Link>
        </div>
        <div className={styles.storeInfo}>
          <div className={styles.storeInfoText}>
            <p className={styles.storeName}>{STORE_NAME}</p>
            <p className={styles.managerName}>{MANAGER_NAME}</p>
          </div>
          {/* 아직 실제 로그아웃 기능이 없는 시각적 placeholder다. */}
          <button
            type="button"
            className={styles.logoutButton}
            aria-label="로그아웃"
            disabled
          >
            <LogOut className={styles.logoutButtonIcon} aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
}
