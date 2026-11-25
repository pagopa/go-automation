/**
 * Go Report Error Patterns - Main Logic Module
 *
 * Implements CloudWatch alarm history querying, automatic evaluation datapoint time-window
 * extraction, pattern analysis execution and frequency reporting across modular reports.
 */

import type { GOScript } from '@go-automation/go-script';
import type { GoReportErrorPatternsConfig } from './types/index.js';
import { analyzeAlarm, loadAlarmConfigs } from './libs/alarm-analysis.js';
import { exportAllReports } from './libs/report.js';
import type { GeneratedReports } from './libs/report.js';

/**
 * Main script execution function
 *
 * @param script - The GOScript instance for logging and prompts
 */
export async function main(script: GOScript): Promise<void> {
  script.logger.section('Starting Go Report Error Patterns');

  const config = await script.getConfiguration<GoReportErrorPatternsConfig>();
  const alarmConfigs = await loadAlarmConfigs(config.configFile);

  const reports: GeneratedReports[] = [];
  for (const item of alarmConfigs) {
    reports.push(...(await analyzeAlarm(script, item, config.awsProfiles)));
  }

  await exportAllReports(script, {
    dominantReports: reports.map((report) => report.dominantReport),
    patternCoverageReports: reports.map((report) => report.patternCoverageReport),
    tiedCombinationsReports: reports.map((report) => report.tiedCombinationsReport),
  });

  script.logger.success('Analisi dei pattern completata con successo.');
}
