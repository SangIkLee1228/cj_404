import Image from 'next/image';
import { LayoutDashboard, Package, Tag, BarChart3, Bell } from 'lucide-react';
import styles from '../dashboard-layout.module.css';

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
// 표시 상태를 전환한다. 라우팅이 연결돼도 이 구조는 바뀌지 않고
// li의 data-active 값만 바뀌면 된다.
function NavIcon({ Icon, FilledIcon }) {
  return (
    <span className={styles.navIcon} aria-hidden="true">
      <Icon className={styles.iconOutline} />
      <FilledIcon className={styles.iconFilled} />
    </span>
  );
}

const NAV_ENTRIES = [
  // active: true는 실제 라우팅 판별이 아니라, 목업 확인용 임시 시각 상태다.
  // 이후 라우팅 단계에서 usePathname 기반 활성 상태로 교체한다.
  {
    type: 'item',
    label: '운영 현황',
    Icon: LayoutDashboard,
    FilledIcon: OverviewIconFilled,
    active: true,
  },
  { type: 'label', label: 'OPERATIONS' },
  {
    type: 'item',
    label: '재고 관리',
    Icon: Package,
    FilledIcon: InventoryIconFilled,
  },
  {
    type: 'item',
    label: '상품 관리',
    Icon: Tag,
    FilledIcon: ProductIconFilled,
  },
  { type: 'label', label: 'ANALYTICS' },
  {
    type: 'item',
    label: '판매 통계',
    Icon: BarChart3,
    FilledIcon: SalesIconFilled,
  },
];

// API 연결 전 UI 확인용 placeholder이며, 실제 매장/담당자 데이터가 아니다.
const STORE_NAME = '뚜레쥬르 매장';
const MANAGER_NAME = '매장 관리자';

export default function DashboardSidebar() {
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
          {NAV_ENTRIES.map((entry) =>
            entry.type === 'label' ? (
              <li key={entry.label} className={styles.navSectionLabel}>
                {entry.label}
              </li>
            ) : (
              <li
                key={entry.label}
                className={styles.navItem}
                data-active={entry.active ? 'true' : undefined}
              >
                <NavIcon Icon={entry.Icon} FilledIcon={entry.FilledIcon} />
                <span>{entry.label}</span>
              </li>
            )
          )}
        </ul>
      </nav>
      <div className={styles.sidebarBottom}>
        <div className={styles.navItem}>
          <NavIcon Icon={Bell} FilledIcon={AlertIconFilled} />
          <span>알림</span>
        </div>
        <div className={styles.storeInfo}>
          <p className={styles.storeName}>{STORE_NAME}</p>
          <p className={styles.managerName}>{MANAGER_NAME}</p>
        </div>
      </div>
    </aside>
  );
}
