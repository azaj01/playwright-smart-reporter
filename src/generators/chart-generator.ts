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

  // Chart height in pixels
  const maxBarHeight = 80;
  const secondaryBarHeight = 35;

  // Find max values for scaling secondary charts
  const allDurations = [...summaries.map(s => s.duration || 0), currentDuration];
  const maxDuration = Math.max(...allDurations);
  const allFlaky = [...summaries.map(s => s.flaky || 0), currentFlaky];
  const maxFlaky = Math.max(...allFlaky, 1); // At least 1 to avoid division by zero
  const allSlow = [...summaries.map(s => s.slow || 0), currentSlow];
  const maxSlow = Math.max(...allSlow, 1);

  // Generate stacked bars for test status - heights relative to 100% (excluding skipped)
  const bars = summaries.map((s) => {
    const nonSkippedTotal = s.passed + s.failed || 1;
    const passedPct = (s.passed / nonSkippedTotal) * 100;
    const failedPct = (s.failed / nonSkippedTotal) * 100;
    const totalHeight = passedPct + failedPct;
    const scaleFactor = totalHeight > 0 ? maxBarHeight / 100 : 1;

    const date = formatShortDate(s.timestamp);
    return `
      <div class="trend-bar-wrapper">
        <div class="trend-stacked-bar" style="height: ${maxBarHeight}px">
          ${failedPct > 0 ? `<div class="trend-segment failed" style="height: ${failedPct * scaleFactor}px"><span class="trend-segment-label">${s.failed} failed</span></div>` : ''}
          <div class="trend-segment passed" style="height: ${passedPct * scaleFactor}px"><span class="trend-segment-label">${s.passed} passed</span></div>
        </div>
        <span class="trend-label">${date}</span>
      </div>
    `;
  }).join('');

  // Add current run stacked bar - heights relative to 100% (excluding skipped)
  const currentNonSkippedTotal = passed + failed || 1;
  const currentPassedPct = (passed / currentNonSkippedTotal) * 100;
  const currentFailedPct = (failed / currentNonSkippedTotal) * 100;
  const currentScaleFactor = maxBarHeight / 100;
  const currentBar = `
    <div class="trend-bar-wrapper current">
      <div class="trend-stacked-bar" style="height: ${maxBarHeight}px">
        ${currentFailedPct > 0 ? `<div class="trend-segment failed" style="height: ${currentFailedPct * currentScaleFactor}px"><span class="trend-segment-label">${failed} failed</span></div>` : ''}
        <div class="trend-segment passed" style="height: ${currentPassedPct * currentScaleFactor}px"><span class="trend-segment-label">${passed} passed</span></div>
      </div>
      <span class="trend-label">Current</span>
    </div>
  `;

  // Generate duration trend bars
  const durationBars = summaries.map((s) => {
    const duration = s.duration || 0;
    const barHeight = maxDuration > 0 ? Math.max(4, (duration / maxDuration) * secondaryBarHeight) : 4;
    return `
      <div class="secondary-bar-wrapper">
        <div class="secondary-bar duration" style="height: ${barHeight}px" title="${formatDuration(duration)}"></div>
        <span class="secondary-value">${formatDuration(duration)}</span>
      </div>
    `;
  }).join('');

  const currentDurationBarHeight = maxDuration > 0 ? Math.max(4, (currentDuration / maxDuration) * secondaryBarHeight) : 4;
  const currentDurationBar = `
    <div class="secondary-bar-wrapper">
      <div class="secondary-bar duration current" style="height: ${currentDurationBarHeight}px" title="${formatDuration(currentDuration)}"></div>
      <span class="secondary-value">${formatDuration(currentDuration)}</span>
    </div>
  `;

  // Generate flaky trend bars
  const flakyBars = summaries.map((s) => {
    const flakyCount = s.flaky || 0;
    const barHeight = maxFlaky > 0 ? Math.max(flakyCount > 0 ? 4 : 0, (flakyCount / maxFlaky) * secondaryBarHeight) : 0;
    return `
      <div class="secondary-bar-wrapper">
        <div class="secondary-bar flaky" style="height: ${barHeight}px" title="${flakyCount} flaky"></div>
        <span class="secondary-value">${flakyCount}</span>
      </div>
    `;
  }).join('');

  const currentFlakyBarHeight = maxFlaky > 0 ? Math.max(currentFlaky > 0 ? 4 : 0, (currentFlaky / maxFlaky) * secondaryBarHeight) : 0;
  const currentFlakyBar = `
    <div class="secondary-bar-wrapper">
      <div class="secondary-bar flaky current" style="height: ${currentFlakyBarHeight}px" title="${currentFlaky} flaky"></div>
      <span class="secondary-value">${currentFlaky}</span>
    </div>
  `;

  // Generate slow trend bars
  const slowBars = summaries.map((s) => {
    const slowCount = s.slow || 0;
    const barHeight = maxSlow > 0 ? Math.max(slowCount > 0 ? 4 : 0, (slowCount / maxSlow) * secondaryBarHeight) : 0;
    return `
      <div class="secondary-bar-wrapper">
        <div class="secondary-bar slow" style="height: ${barHeight}px" title="${slowCount} slow"></div>
        <span class="secondary-value">${slowCount}</span>
      </div>
    `;
  }).join('');

  const currentSlowBarHeight = maxSlow > 0 ? Math.max(currentSlow > 0 ? 4 : 0, (currentSlow / maxSlow) * secondaryBarHeight) : 0;
  const currentSlowBar = `
    <div class="secondary-bar-wrapper">
      <div class="secondary-bar slow current" style="height: ${currentSlowBarHeight}px" title="${currentSlow} slow"></div>
      <span class="secondary-value">${currentSlow}</span>
    </div>
  `;

  return `
    <div class="trend-section">
      <div class="trend-header">
        <div class="trend-title">📊 Test Run Trends</div>
        <div class="trend-subtitle">Last ${summaries.length + 1} runs</div>
      </div>
      <div class="trend-chart">
        ${bars}
        ${currentBar}
      </div>
      <div class="secondary-trends">
        <div class="secondary-trend-section">
          <div class="secondary-trend-header">
            <div class="secondary-trend-title">⏱️ Duration</div>
          </div>
          <div class="secondary-trend-chart">
            ${durationBars}
            ${currentDurationBar}
          </div>
        </div>
        <div class="secondary-trend-section">
          <div class="secondary-trend-header">
            <div class="secondary-trend-title">🔴 Flaky</div>
          </div>
          <div class="secondary-trend-chart">
            ${flakyBars}
            ${currentFlakyBar}
          </div>
        </div>
        <div class="secondary-trend-section">
          <div class="secondary-trend-header">
            <div class="secondary-trend-title">🐢 Slow</div>
          </div>
          <div class="secondary-trend-chart">
            ${slowBars}
            ${currentSlowBar}
          </div>
        </div>
      </div>
    </div>
  `;
}
