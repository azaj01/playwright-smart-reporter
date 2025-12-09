import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from '@playwright/test/reporter';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// ============================================================================
// Imports: Types
// ============================================================================

import type {
  SmartReporterOptions,
  TestResultData,
  TestHistory,
  RunComparison,
} from './types';

// ============================================================================
// Imports: Collectors
// ============================================================================

import {
  HistoryCollector,
  StepCollector,
  AttachmentCollector,
} from './collectors';

// ============================================================================
// Imports: Analyzers
// ============================================================================

import {
  FlakinessAnalyzer,
  PerformanceAnalyzer,
  RetryAnalyzer,
  FailureClusterer,
  StabilityScorer,
  AIAnalyzer,
} from './analyzers';

// ============================================================================
// Imports: Generators & Notifiers
// ============================================================================

import { generateHtml, type HtmlGeneratorData } from './generators/html-generator';
import { SlackNotifier, TeamsNotifier } from './notifiers';
import { formatDuration } from './utils';

// ============================================================================
// Smart Reporter
// ============================================================================

/**
 * Smart Reporter - Orchestrates all modular components to analyze and report
 * on Playwright test results with AI insights and advanced analytics.
 *
 * Public API:
 * - Implements Playwright's Reporter interface
 * - Constructor takes SmartReporterOptions
 * - Methods: onBegin, onTestEnd, onEnd
 */
class SmartReporter implements Reporter {
  // Core dependencies
  private historyCollector!: HistoryCollector;
  private stepCollector: StepCollector;
  private attachmentCollector: AttachmentCollector;

  // Analyzers
  private flakinessAnalyzer!: FlakinessAnalyzer;
  private performanceAnalyzer!: PerformanceAnalyzer;
  private retryAnalyzer!: RetryAnalyzer;
  private failureClusterer: FailureClusterer;
  private stabilityScorer!: StabilityScorer;
  private aiAnalyzer: AIAnalyzer;

  // Notifiers
  private slackNotifier!: SlackNotifier;
  private teamsNotifier!: TeamsNotifier;

  // State
  private options: SmartReporterOptions;
  private results: TestResultData[] = [];
  private outputDir: string = '';
  private startTime: number = 0;

  constructor(options: SmartReporterOptions = {}) {
    this.options = options;

    // Initialize collectors
    this.stepCollector = new StepCollector();
    this.attachmentCollector = new AttachmentCollector();

    // Initialize other components
    this.failureClusterer = new FailureClusterer();
    this.aiAnalyzer = new AIAnalyzer();
  }

  /**
   * Called when the test run begins
   */
  onBegin(config: FullConfig, _suite: Suite): void {
    this.startTime = Date.now();
    this.outputDir = config.rootDir;

    // Initialize HistoryCollector and load history
    this.historyCollector = new HistoryCollector(this.options, this.outputDir);
    this.historyCollector.loadHistory();

    // Initialize all analyzers with thresholds from options
    const performanceThreshold = this.options.performanceThreshold ?? 0.2;
    const retryFailureThreshold = this.options.retryFailureThreshold ?? 3;
    const stabilityThreshold = this.options.stabilityThreshold ?? 70;

    this.flakinessAnalyzer = new FlakinessAnalyzer(performanceThreshold);
    this.performanceAnalyzer = new PerformanceAnalyzer(performanceThreshold);
    this.retryAnalyzer = new RetryAnalyzer(retryFailureThreshold);
    this.stabilityScorer = new StabilityScorer(stabilityThreshold);

    // Initialize notifiers
    this.slackNotifier = new SlackNotifier(this.options.slackWebhook);
    this.teamsNotifier = new TeamsNotifier(this.options.teamsWebhook);
  }

  /**
   * Called when a test completes
   */
  onTestEnd(test: TestCase, result: TestResult): void {
    const testId = this.getTestId(test);
    const file = path.relative(this.outputDir, test.location.file);

    // Collect test components
    const steps = this.stepCollector.extractSteps(result);
    const attachments = this.attachmentCollector.collectAttachments(result);
    const history = this.historyCollector.getTestHistory(testId);

    // Build test result data
    const testData: TestResultData = {
      testId,
      title: test.title,
      file,
      status: result.status,
      duration: result.duration,
      retry: result.retry,
      steps,
      attachments,
      history,
    };

    // Add error if failed
    if (result.status === 'failed' || result.status === 'timedOut') {
      const error = result.errors[0];
      if (error) {
        testData.error = error.stack || error.message || 'Unknown error';
      }
    }

    // Backwards compatibility: extract first screenshot for legacy code
    if (attachments.screenshots.length > 0) {
      testData.screenshot = attachments.screenshots[0];
    }

    // Backwards compatibility: extract first video for legacy code
    if (attachments.videos.length > 0) {
      testData.videoPath = attachments.videos[0];
    }

    // Run all analyzers
    this.flakinessAnalyzer.analyze(testData, history);
    this.performanceAnalyzer.analyze(testData, history);
    this.retryAnalyzer.analyze(testData, history);
    this.stabilityScorer.scoreTest(testData);

    this.results.push(testData);
  }

  /**
   * Called when the test run completes
   */
  async onEnd(result: FullResult): Promise<void> {
    // Get failure clusters
    const failureClusters = this.failureClusterer.clusterFailures(this.results);

    // Run AI analysis on failures and clusters if enabled
    const options = this.historyCollector.getOptions();
    if (options.enableAIRecommendations !== false) {
      await this.aiAnalyzer.analyzeFailed(this.results);
      if (failureClusters.length > 0) {
        await this.aiAnalyzer.analyzeClusters(failureClusters);
      }
    }

    // Get comparison data if enabled
    let comparison: RunComparison | undefined;
    if (options.enableComparison !== false) {
      const baselineRun = this.historyCollector.getBaselineRun();
      if (baselineRun) {
        // TODO: Implement comparison logic
        // This would compare current run against baseline
      }
    }

    // Prepare data for HTML generation
    const htmlData: HtmlGeneratorData = {
      results: this.results,
      history: this.historyCollector.getHistory(),
      startTime: this.startTime,
      options: this.options,
      comparison,
    };

    // Generate and save HTML report
    const html = generateHtml(htmlData);
    const outputPath = path.resolve(this.outputDir, this.options.outputFile ?? 'smart-report.html');

    // Use dynamic import to support both CommonJS and ESM
    const fs = await import('fs');
    fs.writeFileSync(outputPath, html);
    console.log(`\n📊 Smart Report: ${outputPath}`);

    // Update history
    this.historyCollector.updateHistory(this.results);

    // Send webhook notifications if enabled
    const failed = this.results.filter(r => r.status === 'failed' || r.status === 'timedOut').length;
    if (failed > 0) {
      await this.slackNotifier.notify(this.results);
      await this.teamsNotifier.notify(this.results);
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Create a unique test ID from test file and title
   * @param test - Playwright TestCase
   * @returns Test ID string (e.g., "src/tests/login.spec.ts::Login Test")
   */
  private getTestId(test: TestCase): string {
    const relativePath = path.relative(this.outputDir, test.location.file);
    return `${relativePath}::${test.title}`;
  }
}

// ============================================================================
// Export
// ============================================================================

export default SmartReporter;
