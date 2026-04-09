/**
 * Display helpers for rendering alarm reports to the console.
 */

import { Core } from '@go-automation/go-common';

import type { AlarmHistoryItem } from '@aws-sdk/client-cloudwatch';
import type { AlarmReportSummary, AlarmTimelineEntry } from '../types/alarms.types.js';
import type { GoReportAlarmsConfig } from '../types/GoReportAlarmsConfig.js';
import type { MultiProfileQueryResult } from '../types/MultiProfileQueryResult.js';

import { AlarmAnalyzer } from './AlarmAnalyzer.js';
import { googleSheetTimestamp } from './DateUtils.js';

/**
 * Display multi-profile query summary.
 *
 * @param script - GOScript instance for logging
 * @param result - The multi-profile query result
 */
export function displayProfileSummary(script: Core.GOScript, result: MultiProfileQueryResult): void {
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
 * Display ignored alarms report.
 *
 * @param script - GOScript instance for logging
 * @param analyzer - AlarmAnalyzer for generating summaries
 * @param ignored - Array of ignored alarm history items
 */
export function displayIgnoredAlarmsReport(
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
 * Display analyzable alarms summary report.
 *
 * @param script - GOScript instance for logging
 * @param analyzer - AlarmAnalyzer for count computation
 * @param summary - Array of alarm report summaries
 */
export function displayAnalyzableSummary(
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
 * Display detailed timeline for analyzable alarms.
 *
 * @param script - GOScript instance for logging
 * @param config - Script configuration (for verbose flag)
 * @param timeline - Array of alarm timeline entries
 */
export function displayDetailedTimeline(
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
