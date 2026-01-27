/**
 * GO Report Alarms - Main Logic Module
 *
 * Contains the core business logic for CloudWatch alarm analysis.
 * Receives typed dependencies (script + config) for clean separation of concerns.
 */

import { fromIni } from '@aws-sdk/credential-provider-ini';
import { Core } from '@go-automation/go-common';

import type { AlarmHistoryItem } from '@aws-sdk/client-cloudwatch';
import type { GoReportAlarmsConfig } from './config.js';
import type { AlarmReportSummary, AlarmTimelineEntry } from './types/alarms.types.js';

import { AlarmAnalyzer } from './libs/AlarmAnalyzer.js';
import { CloudWatchService } from './libs/CloudWatchService.js';
import { googleSheetTimestamp } from './libs/DateUtils.js';

/** AWS region for CloudWatch operations */
const AWS_REGION = 'eu-south-1';

// ============================================================================
// Display Functions
// ============================================================================

/**
 * Display ignored alarms report
 */
function displayIgnoredAlarmsReport(
  script: Core.GOScript,
  analyzer: AlarmAnalyzer,
  ignored: ReadonlyArray<AlarmHistoryItem>,
): void {
  if (ignored.length === 0) {
    script.logger.section('No Alarms Ignored');
    return;
  }

  const ignoredSummary = analyzer.generateSummary(ignored);

  script.logger.section('Ignored Alarms Report');

  for (const summary of ignoredSummary) {
    script.logger.text(`[${summary.count}] ${summary.alarmName}`);
  }

  const totalIgnored = analyzer.getTotalCount(ignoredSummary);
  script.logger.info(`Total Ignored: ${totalIgnored}`);
}

/**
 * Display analyzable alarms summary report
 */
function displayAnalyzableSummary(
  script: Core.GOScript,
  analyzer: AlarmAnalyzer,
  summary: ReadonlyArray<AlarmReportSummary>,
): void {
  script.logger.section('Analyzable Alarms Report');

  for (const alarmSummary of summary) {
    script.logger.text(`[${alarmSummary.count}] ${alarmSummary.alarmName}`);
  }

  const totalNotIgnored = analyzer.getTotalCount(summary);
  script.logger.info(`Total Analyzable: ${totalNotIgnored}`);
}

/**
 * Display detailed timeline for analyzable alarms
 */
function displayDetailedTimeline(
  script: Core.GOScript,
  config: GoReportAlarmsConfig,
  timeline: ReadonlyArray<AlarmTimelineEntry>,
): void {
  script.logger.section('Analyzable Alarms Details');

  for (const entry of timeline) {
    script.logger.text(`[${entry.timestamps.length}] ${entry.alarmName}`);

    if (!config.verbose && entry.timestamps.length > 2) {
      const last = entry.timestamps[0];
      const first = entry.timestamps[entry.timestamps.length - 1];
      if (first && last) {
        script.logger.text(` - Last:  ${last.toISOString()} - (${googleSheetTimestamp(last)})`);
        script.logger.text(` - First: ${first.toISOString()} - (${googleSheetTimestamp(first)})`);
      }
    } else {
      for (const timestamp of entry.timestamps) {
        script.logger.text(`  - ${timestamp.toISOString()} - (${googleSheetTimestamp(timestamp)})`);
      }
    }
    script.logger.newline();
  }
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Main script execution function
 *
 * Analyzes CloudWatch alarms based on provided configuration.
 * This function contains the core business logic, decoupled from
 * script initialization and configuration parsing.
 *
 * @param script - The GOScript instance for logging and prompts
 * @param config - Validated configuration object
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<GoReportAlarmsConfig>();

  // Initialize services with AWS SSO profile
  const awsConfig = {
    region: AWS_REGION,
    credentials: fromIni({ profile: config.awsProfile }),
  };
  const cloudWatchService = new CloudWatchService(awsConfig);
  const alarmAnalyzer = new AlarmAnalyzer();

  try {
    // Fetch alarm history
    script.logger.section('Fetching Alarm History');
    script.prompt.startSpinner('Retrieving alarm history from AWS CloudWatch...');

    const alarmHistoryItems = await cloudWatchService.describeAlarmHistory(
      config.startDate,
      config.endDate,
      config.alarmName,
    );

    script.prompt.spinnerStop(`Retrieved ${alarmHistoryItems.length} alarm history items`);

    // Filter alarms
    const { notIgnored, ignored } = alarmAnalyzer.filterAlarms(
      alarmHistoryItems,
      config.ignorePatterns,
    );

    // Display Ignored Alarms Report
    displayIgnoredAlarmsReport(script, alarmAnalyzer, ignored);

    // Guard: No analyzable alarms
    if (notIgnored.length === 0) {
      script.logger.success('No Analyzable Alarms Found');
      return;
    }

    // Generate full analysis for analyzable alarms (single-pass optimization)
    const { summary, timeline } = alarmAnalyzer.generateFullAnalysis(notIgnored);

    // Display Analyzable Alarms Summary
    displayAnalyzableSummary(script, alarmAnalyzer, summary);

    // Display Detailed Timeline
    displayDetailedTimeline(script, config, timeline);

    await script.logger.reset();
  } finally {
    // Cleanup CloudWatch service
    cloudWatchService.close();
  }
}
