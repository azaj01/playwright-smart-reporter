/**
 * Chart Generator - Handles all chart generation (trend charts, duration, flaky, slow)
 */

import type { TestResultData, TestHistory, RunSummary } from '../types';
import { formatDuration, formatShortDate } from '../utils';

export interface ChartData {
  results: TestResultData[];
  history: TestHistory;
  startTime: number;
}

/**
 * Generate the main trend chart showing pass/fail trends over time
 */
export function generateTrendChart(data: ChartData): string {
  const summaries = data.history.summaries || [];
  if (summaries.length < 2) {
    return ''; // Don't show trend with less than 2 data points
  }

  const passed = data.results.filter(r => r.status === 'passed').length;
  const failed = data.results.filter(r => r.status === 'failed' || r.status === 'timedOut').length;
  const skipped = data.results.filter(r => r.status === 'skipped').length;
  const currentFlaky = data.results.filter(r => r.flakinessScore && r.flakinessScore >= 0.3).length;
  const currentSlow = data.results.filter(r => r.performanceTrend?.startsWith('↑')).length;
  const total = data.results.length;
  const currentDuration = Date.now() - data.startTime;

  // Chart dimensions
  const chartWidth = 800;
  const chartHeight = 120;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  // Prepare data points including current run
  const allSummaries = [...summaries, {
    runId: 'current',
    timestamp: new Date().toISOString(),
    total,
    passed,
    failed,
    skipped,
    flaky: currentFlaky,
    slow: currentSlow,
    duration: currentDuration,
    passRate: total > 0 ? Math.round((passed / total) * 100) : 0
  }];

  // Find max values for scaling
  const maxTotal = Math.max(...allSummaries.map((s: any) => s.passed + s.failed), 1);
  const maxDuration = Math.max(...allSummaries.map((s: any) => s.duration || 0), 1);
  const maxFlaky = Math.max(...allSummaries.map((s: any) => s.flaky || 0), 1);
  const maxSlow = Math.max(...allSummaries.map((s: any) => s.slow || 0), 1);

  // Helper function to generate SVG line chart
  const generateLineChart = (
    chartData: any[],
    getValue: (d: any) => number,
    maxValue: number,
    color: string,
    yAxisLabel: string
  ): string => {
    const stepX = plotWidth / (chartData.length - 1);

    // Generate line points
    const points = chartData.map((d, i) => {
      const x = padding.left + i * stepX;
      const value = getValue(d);
      const y = padding.top + plotHeight - (value / maxValue) * plotHeight;
      return `${x},${y}`;
    }).join(' ');

    // Generate data point circles
    const circles = chartData.map((d, i) => {
      const x = padding.left + i * stepX;
      const value = getValue(d);
      const y = padding.top + plotHeight - (value / maxValue) * plotHeight;
      const label = i === chartData.length - 1 ? 'Current' : formatShortDate(d.timestamp);
      const isCurrent = i === chartData.length - 1;
      return `
        <circle cx="${x}" cy="${y}" r="${isCurrent ? 5 : 3}" fill="${color}" stroke="var(--bg-primary)" stroke-width="2">
          <title>${label}: ${value}</title>
        </circle>
      `;
    }).join('');

    // Generate x-axis labels
    const xLabels = chartData.map((d, i) => {
      if (i % Math.ceil(chartData.length / 5) !== 0 && i !== chartData.length - 1) return '';
      const x = padding.left + i * stepX;
      const label = i === chartData.length - 1 ? 'Now' : formatShortDate(d.timestamp);
      return `<text x="${x}" y="${chartHeight - 5}" fill="var(--text-muted)" font-size="10" text-anchor="middle">${label}</text>`;
    }).join('');

    // Generate y-axis labels
    const yTicks = 4;
    const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
      const value = Math.round((maxValue / yTicks) * i);
      const y = padding.top + plotHeight - (i / yTicks) * plotHeight;
      return `
        <text x="${padding.left - 5}" y="${y + 4}" fill="var(--text-muted)" font-size="10" text-anchor="end">${value}</text>
        <line x1="${padding.left}" y1="${y}" x2="${padding.left + plotWidth}" y2="${y}" stroke="var(--border-subtle)" stroke-width="1" opacity="0.3"/>
      `;
    }).join('');

    return `
      <svg width="${chartWidth}" height="${chartHeight}" style="overflow: visible;">
        <!-- Y-axis label -->
        <text x="10" y="${chartHeight / 2}" fill="var(--text-secondary)" font-size="11" font-weight="600" text-anchor="middle" transform="rotate(-90, 10, ${chartHeight / 2})">${yAxisLabel}</text>

        <!-- Grid lines and y-axis labels -->
        ${yLabels}

        <!-- Line -->
        <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>

        <!-- Data points -->
        ${circles}

        <!-- X-axis labels -->
        ${xLabels}
      </svg>
    `;
  };

  // Generate pass rate line chart
  const passRateChart = generateLineChart(
    allSummaries,
    (s: any) => s.passRate || 0,
    100,
    'var(--accent-green)',
    'Pass Rate (%)'
  );

  // Generate duration line chart
  const durationChart = generateLineChart(
    allSummaries,
    (s: any) => Math.round((s.duration || 0) / 1000), // Convert to seconds
    Math.ceil(maxDuration / 1000),
    'var(--accent-purple)',
    'Duration (s)'
  );

  // Generate flaky tests line chart
  const flakyChart = generateLineChart(
    allSummaries,
    (s: any) => s.flaky || 0,
    maxFlaky,
    'var(--accent-yellow)',
    'Flaky Tests'
  );

  // Generate slow tests line chart
  const slowChart = generateLineChart(
    allSummaries,
    (s: any) => s.slow || 0,
    maxSlow,
    'var(--accent-orange)',
    'Slow Tests'
  );

  return `
    <div class="trend-section">
      <div class="trend-header">
        <div class="trend-title">📊 Test Run Trends</div>
        <div class="trend-subtitle">Last ${allSummaries.length} runs</div>
      </div>

      <!-- Pass Rate Chart -->
      <div class="line-chart-container">
        <h4 class="chart-title">✅ Pass Rate Over Time</h4>
        ${passRateChart}
      </div>

      <!-- Secondary Charts Grid -->
      <div class="secondary-trends-grid">
        <div class="line-chart-container">
          <h4 class="chart-title">⏱️ Duration Trend</h4>
          ${durationChart}
        </div>
        <div class="line-chart-container">
          <h4 class="chart-title">🟡 Flaky Tests</h4>
          ${flakyChart}
        </div>
        <div class="line-chart-container">
          <h4 class="chart-title">🐢 Slow Tests</h4>
          ${slowChart}
        </div>
      </div>
    </div>
  `;
}
