'use client';

import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { formatWon } from './overview-data';
import styles from './overview.module.css';

// Dashboard Overview 모듈 범위에서만 필요한 Chart.js 요소를 등록한다.
// Chart.js 전역 기본값(Chart.defaults.*)은 건드리지 않는다 — 이 등록은
// react-chartjs-2가 요구하는 표준 사용법(요소/플러그인 등록)일 뿐이다.
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend
);

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

// notif_type처럼 이미 정해진 값이 아니라 API label('8', '2026-08-27')을
// 화면 표시용 문구로 바꿔주는 순수 매핑이다. 실제 label 값 자체는
// mutate하지 않고, 이 함수의 반환값만 tick/tooltip 표시에 쓴다.
function formatAxisLabel(unit, rawLabel) {
  if (unit === 'HOUR') {
    return `${rawLabel}시`;
  }
  const [, month, day] = rawLabel.split('-');
  return `${Number(month)}/${Number(day)}`;
}

// 매출·결제 건수 Mixed Chart(OV-2). overview-data.js의
// mapDashboardOverviewToSalesChart가 만든 view model을 그대로 그릴 뿐,
// 이 컴포넌트에서 시계열을 다시 join하거나 합계를 계산하지 않는다.
export default function OverviewSalesChart({ periodLabel, salesChartData }) {
  const { unit, labels, amounts, orderCounts, hasOrderCountSeries } =
    salesChartData;

  const data = useMemo(() => {
    const datasets = [
      {
        type: 'bar',
        label: '매출',
        data: amounts,
        yAxisID: 'y',
        order: 2,
        backgroundColor: (ctx) =>
          readDashboardColor(
            ctx.chart.canvas,
            '--dashboard-color-brand-primary'
          ),
        borderRadius: 3,
      },
    ];
    if (hasOrderCountSeries) {
      datasets.push({
        type: 'line',
        label: '결제 건수',
        data: orderCounts,
        yAxisID: 'y1',
        order: 1,
        tension: 0.3,
        borderColor: (ctx) =>
          readDashboardColor(
            ctx.chart.canvas,
            '--dashboard-color-stock-meter-fill'
          ),
        backgroundColor: (ctx) =>
          readDashboardColor(
            ctx.chart.canvas,
            '--dashboard-color-stock-meter-fill'
          ),
        pointBackgroundColor: (ctx) =>
          readDashboardColor(
            ctx.chart.canvas,
            '--dashboard-color-stock-meter-fill'
          ),
        pointRadius: 3,
      });
    }
    return { labels, datasets };
  }, [labels, amounts, orderCounts, hasOrderCountSeries]);

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: {
            boxWidth: 10,
            color: (ctx) =>
              readDashboardColor(
                ctx.chart.canvas,
                '--dashboard-color-text-muted'
              ),
          },
        },
        tooltip: {
          callbacks: {
            title: (items) => {
              const rawLabel = items[0]?.label ?? '';
              return unit === 'HOUR' ? `${rawLabel}시` : rawLabel;
            },
            label: (item) => {
              if (item.dataset.type === 'line') {
                return `${item.dataset.label}: ${item.formattedValue}건`;
              }
              return `${item.dataset.label}: ${formatWon(item.raw)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            color: (ctx) =>
              readDashboardColor(ctx.chart.canvas, '--dashboard-color-border'),
          },
          ticks: {
            color: (ctx) =>
              readDashboardColor(
                ctx.chart.canvas,
                '--dashboard-color-text-muted'
              ),
            autoSkip: true,
            maxTicksLimit: 8,
            callback(value) {
              const rawLabel = this.getLabelForValue(value);
              return formatAxisLabel(unit, rawLabel);
            },
          },
        },
        y: {
          beginAtZero: true,
          position: 'left',
          grid: {
            color: (ctx) =>
              readDashboardColor(ctx.chart.canvas, '--dashboard-color-border'),
          },
          ticks: {
            color: (ctx) =>
              readDashboardColor(
                ctx.chart.canvas,
                '--dashboard-color-text-muted'
              ),
          },
        },
        ...(hasOrderCountSeries
          ? {
              y1: {
                beginAtZero: true,
                position: 'right',
                // 오른쪽 축은 왼쪽 grid와 겹쳐 표시되므로 중복 표시하지
                // 않는다.
                grid: { drawOnChartArea: false },
                ticks: {
                  color: (ctx) =>
                    readDashboardColor(
                      ctx.chart.canvas,
                      '--dashboard-color-text-muted'
                    ),
                },
              },
            }
          : {}),
      },
    }),
    [unit, hasOrderCountSeries]
  );

  if (labels.length === 0) {
    return (
      <p
        className={styles.chartEmpty}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        선택한 기간의 매출 데이터가 없습니다.
      </p>
    );
  }

  const chartAriaLabel = hasOrderCountSeries
    ? `${periodLabel} 매출 및 결제 건수 추이 차트`
    : `${periodLabel} 매출 추이 차트`;

  return (
    <>
      <div className={styles.salesChartContainer}>
        <Chart
          type="bar"
          data={data}
          options={options}
          role="img"
          aria-label={chartAriaLabel}
        />
      </div>
      {/* 스크린 리더 전용 데이터 목록. provisional 결제 건수 시계열이
          없으면(hasOrderCountSeries=false) 매출만 읽는다. */}
      <ul className={styles.srOnly}>
        {labels.map((label, index) => (
          <li key={label}>
            {hasOrderCountSeries
              ? `${formatAxisLabel(unit, label)}: 매출 ${formatWon(amounts[index])}, 결제 ${orderCounts[index]}건`
              : `${formatAxisLabel(unit, label)}: 매출 ${formatWon(amounts[index])}`}
          </li>
        ))}
      </ul>
    </>
  );
}
