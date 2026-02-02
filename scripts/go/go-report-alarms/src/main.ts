/**
 * GO Report Alarms - Main Logic Module
 *
 * Contains the core business logic for CloudWatch alarm analysis.
 * Supports both single-account and multi-account modes.
 */

import { Core } from '@go-automation/go-common';

import type { AlarmHistoryItem } from '@aws-sdk/client-cloudwatch';
import type { GoReportAlarmsConfig } from './config.js';
import type { AlarmReportSummary, AlarmTimelineEntry } from './types/alarms.types.js';
import type { MultiProfileQueryResult } from './types/MultiProfileQueryResult.js';

import { AlarmAnalyzer } from './libs/AlarmAnalyzer.js';
import { MultiProfileQueryCoordinator } from './libs/MultiProfileQueryCoordinator.js';
import { googleSheetTimestamp } from './libs/DateUtils.js';

// ============================================================================
// Display Functions
// ============================================================================

/**
 * Display multi-profile query summary
 */
function displayProfileSummary(script: Core.GOScript, result: MultiProfileQueryResult): void {
  script.logger.section('Profile Query Summary');

  // Show successful profiles
  if (result.successfulProfiles.length > 0) {
    script.logger.info('Successful profiles:');
    for (const profile of result.successfulProfiles) {
      script.logger.text(`  [OK] ${profile.profile}: ${profile.itemCount} items`);
    }
  }

  // Show failed profiles
  if (result.failedProfiles.length > 0) {
    script.logger.warning('Failed profiles:');
    for (const profile of result.failedProfiles) {
      script.logger.text(`  [FAIL] ${profile.profile}: ${profile.error.message}`);
    }
  }

  script.logger.newline();
  script.logger.info(
    `Totals: ${result.successfulProfiles.length}/${result.profileCount} profiles successful, ` +
      `${result.totalItemCount} total items`,
  );
}

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

/**
 * Fetch alarm history using multi-profile mode
 */
async function fetchAlarms(
  script: Core.GOScript,
  config: GoReportAlarmsConfig,
): Promise<ReadonlyArray<AlarmHistoryItem>> {
  const coordinator = new MultiProfileQueryCoordinator(script.awsMulti);
  const profiles = config.awsProfiles ?? [];

  script.logger.section('Fetching Alarm History (Multi-Profile)');
  script.logger.info(`Profiles: ${profiles.join(', ')}`);
  script.prompt.setSpinnerIndent(4);
  script.prompt.startSpinner('Retrieving alarm history from AWS CloudWatch...');

  const result = await coordinator.queryAllProfiles({
    profiles,
    startDate: config.startDate,
    endDate: config.endDate,
    alarmName: config.alarmName,
    onProgress: (profile, status) => {
      if (status === 'start') {
        script.prompt.updateSpinner(`Querying profile: ${profile}...`);
      }
    },
  });

  script.prompt.spinnerStop(
    `Retrieved ${result.totalItemCount} alarm history items from ${result.successfulProfiles.length} profiles`,
  );

  // Display profile summary
  displayProfileSummary(script, result);

  // Handle case where all profiles failed
  if (result.successfulProfiles.length === 0) {
    throw new Error('All profile queries failed. Cannot continue.');
  }

  // Warn if some profiles failed
  if (!result.allSucceeded) {
    script.logger.warning(
      `Continuing with ${result.successfulProfiles.length} successful profiles. ` +
        `${result.failedProfiles.length} profiles failed.`,
    );
  }

  return result.items;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Main script execution function
 *
 * Analyzes CloudWatch alarms based on provided configuration.
 * Supports both single-account and multi-account modes.
 *
 * @param script - The GOScript instance for logging and prompts
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<GoReportAlarmsConfig>();

  // Fetch alarm history
  const items = await fetchAlarms(script, config);

  // Filter alarms
  const alarmAnalyzer = new AlarmAnalyzer();
  const patterns = config.ignorePatterns;
  const { notIgnored, ignored } = alarmAnalyzer.filterAlarms(items, patterns);

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
}
