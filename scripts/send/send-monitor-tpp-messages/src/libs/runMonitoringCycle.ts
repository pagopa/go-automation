/**
 * Monitoring workflow: run Athena query, process results, save CSV, send Slack report.
 *
 * Extracted from main.ts to keep main() focused on orchestration
 * (date parsing, service init, try/catch/finally lifecycle).
 */

import { Core } from '@go-automation/go-common';

import { convertAthenaResults } from './AthenaUtils.js';
import type { AthenaQueryExecutor } from './AthenaQueryExecutor.js';
import type { SlackNotifier } from './SlackNotifier.js';
import { buildQueryParams } from './buildQueryParams.js';
import { saveAndAnalyzeResults } from './saveAndAnalyzeResults.js';
import { sendSlackReport } from './sendSlackReport.js';
import type { AthenaQueryConfig } from '../types/AthenaQueryConfig.js';
import type { TPPMonitorConfig } from '../types/TPPMonitorConfig.js';

/**
 * Executes a single monitoring cycle end-to-end.
 *
 * @param script - GOScript instance for logging and prompts
 * @param config - Resolved TPP monitor configuration
 * @param athenaExecutor - Pre-initialised Athena query executor
 * @param slackNotifier - Slack notifier, or null when Slack isn't configured
 * @param reportsPath - Absolute path to the reports output folder
 * @param startDate - Inclusive lower bound of the query time range
 * @param endDate - Exclusive upper bound of the query time range
 */
export async function runMonitoringCycle(
  script: Core.GOScript,
  config: TPPMonitorConfig,
  athenaExecutor: AthenaQueryExecutor,
  slackNotifier: SlackNotifier | null,
  reportsPath: string,
  startDate: Date,
  endDate: Date,
): Promise<void> {
  const queryParams = buildQueryParams(startDate, endDate);
  const athenaConfig: AthenaQueryConfig = {
    database: config.athenaDatabase,
    catalog: config.athenaCatalog,
    workGroup: config.athenaWorkgroup,
    outputLocation: config.athenaOutputLocation,
    maxRetries: config.athenaMaxRetries,
    retryDelay: config.athenaRetryDelay,
  };

  script.logger.section('Executing Athena Query');
  script.prompt.startSpinner('Running query...');
  const queryStart = Date.now();
  const results = await athenaExecutor.executeQuery(config.athenaQuery, athenaConfig, queryParams);
  script.prompt.spinnerStop('Query completed');
  script.logger.info(`[breadcrumb] athena.totalDurationMs=${Date.now() - queryStart}`);

  script.logger.section('Processing Results');
  script.logger.info(`[breadcrumb] reportsPath=${reportsPath} rawRows=${results.ResultSet.Rows.length}`);
  const data = convertAthenaResults(results);
  script.logger.info(`[breadcrumb] dataRows=${data.length}`);

  const { csvFilePath, fileName, rowCount, analysis } = await saveAndAnalyzeResults(
    data,
    reportsPath,
    config.analysisThresholdField,
    config.analysisThreshold,
  );
  script.logger.info(`[breadcrumb] csvFilePath=${csvFilePath ?? 'null'}`);

  script.logger.info(`Total rows: ${rowCount}`);
  script.logger.info(`Analysis: ${analysis}`);
  if (csvFilePath) {
    script.logger.info(`CSV saved to: ${csvFilePath}`);
  }

  const messageTemplate = config.slackMessageTemplate ?? 'Report generated';
  const slackSent = await sendSlackReport(
    slackNotifier,
    messageTemplate,
    startDate,
    endDate,
    csvFilePath,
    rowCount,
    analysis,
    fileName,
  );
  script.logger.info(`[breadcrumb] slackSent=${slackSent}`);

  script.logger.section('Execution Summary');
  script.logger.info(`CSV report: ${csvFilePath ?? 'N/A (no data)'}`);
  script.logger.info(`Total rows: ${rowCount}`);
  script.logger.info(`Slack notification: ${slackSent ? 'SENT' : 'SKIPPED (not configured)'}`);
}
