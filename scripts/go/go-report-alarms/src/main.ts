/**
 * GO Report Alarms - Main Logic Module
 *
 * Contains the core business logic for CloudWatch alarm analysis.
 * Supports both single-account and multi-account modes.
 */

import { Core } from '@go-automation/go-common';

import type { GoReportAlarmsConfig } from './types/GoReportAlarmsConfig.js';

import { AlarmAnalyzer } from './libs/AlarmAnalyzer.js';
import { fetchAlarms } from './libs/fetchAlarms.js';
import {
  displayIgnoredAlarmsReport,
  displayAnalyzableSummary,
  displayDetailedTimeline,
} from './libs/displayReports.js';

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

  // Filter alarms (ignorePatterns resolved by asyncFallback via GOPaths if not provided)
  const alarmAnalyzer = new AlarmAnalyzer();
  const { notIgnored, ignored } = alarmAnalyzer.filterAlarms(items, config.ignorePatterns);

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
}
