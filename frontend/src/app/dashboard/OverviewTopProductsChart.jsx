'use client';

import { useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import styles from './overview.module.css';

// Dashboard Overview 모듈 범위에서만 필요한 Chart.js 요소를 등록한다.
// Chart.js 전역 기본값(Chart.defaults.*)은 건드리지 않는다.
ChartJS.register(ArcElement, Tooltip);

// Doughnut 슬라이스·DOM legend 스와치가 같은 색을 쓰도록, 실제 색상이
// 아니라 토큰 "이름"만 공유한다 — 슬라이스는 Chart.js scriptable
// color에서, legend swatch는 일반 DOM style에서 각자
// var(token)/getComputedStyle로 같은 토큰을 읽는다. 색상 값 자체는 여기
// 하드코딩하지 않고 overview.module.css의 .doughnutLayout에 정의한
// 목업 팔레트 CSS custom property를 읽는다.
const TOP_PRODUCT_COLOR_TOKENS = [
  '--overview-top-product-color-1',
  '--overview-top-product-color-2',
  '--overview-top-product-color-3',
  '--overview-top-product-color-4',
  '--overview-top-product-color-5',
];
const OTHER_COLOR_TOKEN = '--overview-top-product-other-color';

// "기타" 항목은 상위 5개 팔레트가 아니라 별도의 회색 계열 토큰을 쓴다.
function getColorToken(item) {
  if (item.isOther) {
    return OTHER_COLOR_TOKEN;
  }
  return TOP_PRODUCT_COLOR_TOKENS[
    item.colorIndex % TOP_PRODUCT_COLOR_TOKENS.length
  ];
}

// 도넛 중앙에 표시하는 기간 전체 판매 수량은 ko-KR 천 단위 구분 표시를
// 쓴다(예: 3,120).
const QUANTITY_FORMATTER = new Intl.NumberFormat('ko-KR');

// Canvas 2D API는 CSS var() 문자열을 그대로 색상으로 받아들이지 못하므로,
// Chart.js가 실제로 그리는 시점(scriptable color callback 내부)에 canvas
// 엘리먼트의 computed style에서 실제 색상 값을 읽는다. 브라우저에서만
// 호출되고(SSR에서는 canvas가 아직 그려지지 않아 이 콜백 자체가 실행되지
// 않는다), 값이 비어 있으면 undefined를 돌려줘 Chart.js 기본 색상이
// 그대로 쓰이게 한다(임의 hex fallback을 추가하지 않는다).
function readDashboardColor(canvas, tokenName) {
  if (typeof window === 'undefined' || !canvas) {
    return undefined;
  }
  const value = getComputedStyle(canvas).getPropertyValue(tokenName).trim();
  return value || undefined;
}

// 판매 상위 품목 Doughnut Chart(OV-2). overview-data.js의
// mapDashboardOverviewToTopProductsChart가 만든 view model을 그대로 그릴
// 뿐, 이 컴포넌트에서 순위·비율을 다시 계산하지 않는다. Chart.js 기본
// legend는 끄고, 상품명·수량·비율을 접근성 있는 텍스트로 보여주는 DOM
// legend를 직접 구현한다.
export default function OverviewTopProductsChart({
  periodLabel,
  topProductsChartData,
}) {
  const { values, total, items } = topProductsChartData;

  const data = useMemo(
    () => ({
      labels: items.map((item) => item.label),
      datasets: [
        {
          data: values,
          borderWidth: 0,
          backgroundColor: (ctx) =>
            readDashboardColor(
              ctx.chart.canvas,
              getColorToken(items[ctx.dataIndex])
            ),
        },
      ],
    }),
    [items, values]
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      cutout: '68%',
      plugins: {
        // Chart.js 기본 legend는 끄고 아래 커스텀 DOM legend를 쓴다(목업
        // 처럼 상품명·수량·비율을 함께 보여주고, 좁은 화면에서도 접근성
        // 있는 텍스트를 유지하기 위함).
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => {
              const entry = items[item.dataIndex];
              return `${entry.label}: ${entry.quantity}개 (${entry.ratio}%)`;
            },
          },
        },
      },
    }),
    [items]
  );

  if (items.length === 0) {
    return (
      <p
        className={styles.chartEmpty}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        선택한 기간의 판매 품목 데이터가 없습니다.
      </p>
    );
  }

  return (
    <div className={styles.doughnutLayout}>
      <div className={styles.doughnutCanvasWrapper}>
        <Doughnut
          data={data}
          options={options}
          role="img"
          aria-label={`${periodLabel} 판매 상위 품목 비중 도넛 차트`}
        />
        <div className={styles.doughnutCenterOverlay} aria-hidden="true">
          <span className={styles.doughnutCenterValue}>
            {QUANTITY_FORMATTER.format(total)}
          </span>
          <span className={styles.doughnutCenterLabel}>판매 수량</span>
        </div>
      </div>
      {/* DOM legend가 실제 데이터 텍스트 역할을 담당한다 — 색상만으로
          품목을 구분하지 않도록 상품명·수량·비율을 항상 텍스트로 함께
          보여준다. "기타"는 항상 items의 마지막 항목이라 순서를 그대로
          따르면 마지막 행에 표시된다. */}
      <ul className={styles.chartLegend}>
        {items.map((item) => (
          <li key={item.colorIndex} className={styles.chartLegendRow}>
            <span
              className={styles.chartLegendSwatch}
              aria-hidden="true"
              style={{ backgroundColor: `var(${getColorToken(item)})` }}
            />
            <span className={styles.chartLegendName} title={item.label}>
              {item.label}
            </span>
            <span
              className={styles.chartLegendQty}
            >{`${item.quantity}개`}</span>
            <span className={styles.chartLegendRatio}>{`${item.ratio}%`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
