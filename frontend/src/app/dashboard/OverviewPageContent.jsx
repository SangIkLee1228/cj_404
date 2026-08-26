'use client';

import { useState } from 'react';
import PageHeader from './components/PageHeader';
import SegmentedControl from './components/ui/SegmentedControl';
import Card from './components/ui/Card';
import OverviewSalesChart from './OverviewSalesChart';
import OverviewTopProductsChart from './OverviewTopProductsChart';
import dashboardLayoutStyles from './dashboard-layout.module.css';
import styles from './overview.module.css';
import {
  DEFAULT_OVERVIEW_QUERY,
  queryMockDashboardOverview,
  getMockOverviewKpiComparison,
  mapDashboardOverviewToKpiCards,
  getOverviewPageTitle,
  getOverviewPeriodLabel,
  getMockOverviewOrderCountSeries,
  mapDashboardOverviewToSalesChart,
  mapDashboardOverviewToTopProductsChart,
} from './overview-data';
import { OVERVIEW_PERIOD_FILTER_OPTIONS } from './overview-mock-data';

// 왼쪽 차트 카드 제목/보조문구. 목업(dashboard_mock.html)의 문구를 그대로
// 따른다(새 업무 규칙 없음, 단순 매핑).
const SALES_CHART_TITLE = {
  TODAY: '시간대별 매출',
  '7D': '일별 매출',
  '30D': '일별 매출',
};
const SALES_CHART_SUBTITLE = {
  TODAY: '오늘 · 결제 완료 기준',
  '7D': '최근 1주일 · KST 결제 완료 기준',
  '30D': '최근 1개월 · KST 결제 완료 기준',
};

// trend → 시각 기호/톤 클래스 매핑(새 판정 로직 없음 — trend 자체는
// overview-data.js의 mapDashboardOverviewToKpiCards가 이미 판정해 넘겨준
// 값을 그대로 옮길 뿐이다).
const TREND_ICON = { UP: '▲', DOWN: '▼', FLAT: '–' };
const TREND_TONE_CLASS = {
  UP: 'kpiChangeUp',
  DOWN: 'kpiChangeDown',
  FLAT: 'kpiChangeFlat',
};
const TREND_LABEL = { UP: '상승', DOWN: '하락', FLAT: '변동 없음' };

// KPI 카드 하단의 증감률 문구. trend가 null이면(비교값이 없거나 유효하지
// 않으면) 중립 보조문구로 안전하게 대체한다 — 렌더링 오류를 만들지
// 않는다. 시각 기호(▲/▼)만으로 의미를 전달하지 않도록 항상 텍스트를
// 함께 두고, 스크린리더 announcement는 aria-label 하나로 통일해 기호와
// 텍스트를 중복 낭독하지 않게 한다.
function KpiChange({ trend, changePct }) {
  if (trend === null || changePct === null) {
    return (
      <span className={`${styles.kpiChange} ${styles.kpiChangeNeutral}`}>
        결제 완료 기준
      </span>
    );
  }

  const toneClassName = styles[TREND_TONE_CLASS[trend]];

  if (trend === 'FLAT') {
    return (
      <span
        className={`${styles.kpiChange} ${toneClassName}`}
        aria-label="변동 없음, 전 기간 대비"
      >
        <span aria-hidden="true">변동 없음 · 전 기간 대비</span>
      </span>
    );
  }

  const absPct = Math.abs(changePct).toFixed(1);
  return (
    <span
      className={`${styles.kpiChange} ${toneClassName}`}
      aria-label={`${TREND_LABEL[trend]} ${absPct}퍼센트, 전 기간 대비`}
    >
      <span aria-hidden="true" className={styles.kpiChangeIcon}>
        {TREND_ICON[trend]}
      </span>
      <span aria-hidden="true">{`${absPct}% 전 기간 대비`}</span>
    </span>
  );
}

export default function OverviewPageContent() {
  const [queryState, setQueryState] = useState(DEFAULT_OVERVIEW_QUERY);

  function handlePeriodChange(period) {
    setQueryState((prev) => ({ ...prev, period }));
  }

  // 실제 응답과 provisional 비교값을 각각 별도 함수로 조회한 뒤,
  // mapDashboardOverviewToKpiCards에서만 합쳐 view model을 만든다 — 이
  // 컴포넌트에서 KPI 합계나 trend를 직접 계산하지 않는다.
  const overviewResponse = queryMockDashboardOverview(queryState);
  const kpiComparison = getMockOverviewKpiComparison(queryState.period);
  const kpiCards = mapDashboardOverviewToKpiCards(
    overviewResponse,
    kpiComparison
  );
  const periodLabel = getOverviewPeriodLabel(queryState.period);

  // 매출·결제 건수 Mixed Chart와 판매 상위 품목 Doughnut도 같은 패턴이다
  // — 실제 응답과 provisional 시계열을 각각 조회한 뒤, 결합·파생은
  // overview-data.js의 매핑 함수에만 맡긴다(label join, 합계, ratio 계산
  // 전부 이 컴포넌트에서 하지 않음).
  const orderCountSeries = getMockOverviewOrderCountSeries(queryState.period);
  const salesChartData = mapDashboardOverviewToSalesChart(
    overviewResponse,
    orderCountSeries
  );
  const topProductsChartData =
    mapDashboardOverviewToTopProductsChart(overviewResponse);

  return (
    <section className={dashboardLayoutStyles.page}>
      <PageHeader
        title={getOverviewPageTitle(queryState.period)}
        description="POS 결제가 완료된 즉시 판매·재고·알림이 반영됩니다."
        actions={
          <div className={styles.filters}>
            {/* 시각적 레이블은 SegmentedControl의 aria-label과 의미가
                겹치므로 스크린 리더에서는 감춘다(중복 방지). */}
            <span className={styles.filterGroupLabel} aria-hidden="true">
              조회 기간
            </span>
            <SegmentedControl
              aria-label="조회 기간 필터"
              items={OVERVIEW_PERIOD_FILTER_OPTIONS}
              value={queryState.period}
              onValueChange={handlePeriodChange}
            />
          </div>
        }
      />
      <div className={dashboardLayoutStyles.pageContent}>
        {/* 페이지 전체가 아니라 KPI Grid에만 제한적으로 aria-live를 둔다
            — 기간 전환 시 바뀌는 값만 스크린리더에 알린다. */}
        <div className={styles.kpiGrid} aria-live="polite">
          {kpiCards.map((card) => (
            <Card
              key={card.key}
              className={[
                styles.kpiCard,
                card.key === 'sales' ? styles.salesCard : null,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className={styles.kpiLabel}>{card.label}</span>
              <span className={styles.kpiValue}>{card.value}</span>
              <KpiChange trend={card.trend} changePct={card.changePct} />
            </Card>
          ))}
        </div>
        <div className={styles.chartGrid}>
          <Card className={styles.chartCard}>
            <div className={styles.chartHeader}>
              <h2 className={styles.chartTitle}>
                {SALES_CHART_TITLE[queryState.period]}
              </h2>
              <span className={styles.chartSubtitle}>
                {SALES_CHART_SUBTITLE[queryState.period]}
              </span>
            </div>
            <div className={styles.chartBody}>
              <OverviewSalesChart
                periodLabel={periodLabel}
                salesChartData={salesChartData}
              />
            </div>
          </Card>
          <Card className={styles.chartCard}>
            <div className={styles.chartHeader}>
              <h2 className={styles.chartTitle}>판매 상위 품목</h2>
              <span className={styles.chartSubtitle}>
                {`${periodLabel} · 판매 수량 비중`}
              </span>
            </div>
            <div className={styles.chartBody}>
              <OverviewTopProductsChart
                periodLabel={periodLabel}
                topProductsChartData={topProductsChartData}
              />
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
