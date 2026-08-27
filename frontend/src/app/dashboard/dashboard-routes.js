// Sidebar와 (다음 단계의) Topbar가 함께 참조할 Dashboard Route 메타데이터.
// 경로 문자열을 여러 컴포넌트에 중복해서 하드코딩하지 않기 위한 단일 출처다.
export const DASHBOARD_ROUTES = {
  overview: {
    href: '/dashboard',
    label: '운영 현황',
  },
  inventory: {
    href: '/dashboard/inventory',
    label: '재고 관리',
  },
  products: {
    href: '/dashboard/products',
    label: '상품 관리',
  },
  sales: {
    href: '/dashboard/sales',
    label: '판매 통계',
  },
  alerts: {
    href: '/dashboard/alerts',
    label: '알림',
  },
};

// href가 /dashboard 같은 최상위 Route면 정확히 일치할 때만 active로 본다.
// 그 외 Route는 하위 상세 경로(href 뒤에 /가 붙는 형태, 예: href/123)도
// 같은 메뉴의 active 범위로 취급한다. includes 같은 느슨한 비교는 쓰지 않는다.
export function isRouteActive(pathname, href) {
  if (href === '/dashboard') {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

// 현재 경로가 속한 Route 메타데이터를 찾는다. isRouteActive를 그대로
// 재사용해 Sidebar의 active 판별과 같은 기준을 따르므로, 하위 상세
// 경로(href/…)에서도 상위 메뉴의 Route가 그대로 조회된다.
export function getDashboardRoute(pathname) {
  return Object.values(DASHBOARD_ROUTES).find((route) =>
    isRouteActive(pathname, route.href)
  );
}
