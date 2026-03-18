/**
 * SEND Monitor TPP Messages - Main Logic Module
 *
 * Contains the core business logic for TPP message monitoring via Athena queries.
 * Receives typed dependencies (script) for clean separation of concerns.
 */

import { Core } from '@go-automation/go-common';

import {
  AwsAthenaService,
  AthenaQueryExecutor,
  CSVManager,
  SlackNotifier,
  formatDateForAthena,
  getDateComponents,
  parseDateTime,
  hoursAgo,
} from './libs/index.js';
import type { AthenaQueryConfig } from './types/AthenaQueryConfig.js';
import type { AthenaQueryResults } from './types/AthenaQueryResults.js';
import type { CSVRow } from './types/CSVRow.js';
import type { QueryParams } from './types/QueryParams.js';
import type { TPPMonitorConfig } from './types/TPPMonitorConfig.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Builds query parameters from parsed date range
 *
 * @param startDate - Start date for query
 * @param endDate - End date for query
 * @returns Query parameters object
 */
function buildQueryParams(startDate: Date, endDate: Date): QueryParams {
  const startComponents = getDateComponents(startDate);
  const endComponents = getDateComponents(endDate);

  return {
    startDate: formatDateForAthena(startDate),
    endDate: formatDateForAthena(endDate),
    startYear: startComponents.year,
    startMonth: startComponents.month,
    startDay: startComponents.day,
    startHour: startComponents.hour,
    endYear: endComponents.year,
    endMonth: endComponents.month,
    endDay: endComponents.day,
    endHour: endComponents.hour,
  };
}

/**
 * Executes the Athena query and returns results
 *
 * @param executor - Athena query executor instance
 * @param queryTemplate - SQL query template
 * @param athenaConfig - Athena configuration
 * @param queryParams - Query parameters
 * @returns Query results
 */
async function executeAthenaQuery(
  executor: AthenaQueryExecutor,
  queryTemplate: string,
  athenaConfig: AthenaQueryConfig,
  queryParams: QueryParams,
): Promise<AthenaQueryResults> {
  return executor.executeQuery(queryTemplate, athenaConfig, queryParams);
}

/**
 * Saves results to CSV and analyzes them
 *
 * @param csvManager - CSV manager instance
 * @param results - Athena query results
 * @param thresholdField - Optional field to analyze
 * @param threshold - Threshold value
 * @returns Analysis results
 */
function saveAndAnalyzeResults(
  csvManager: CSVManager,
  results: AthenaQueryResults,
  thresholdField?: string,
  threshold?: number,
): {
  csvFilePath: string | null;
  rowCount: number;
  analysis: string;
  data: CSVRow[];
} {
  const data = csvManager.convertAthenaResults(results);
  const rowCount = data.length;

  let csvFilePath: string | null = null;
  if (rowCount > 0) {
    csvFilePath = csvManager.saveToCSV(data);
  }

  let analysis: string;
  if (rowCount === 0) {
    analysis = 'No data found in the specified time range';
  } else if (thresholdField && threshold !== undefined && threshold > 0) {
    const flaggedRows = csvManager.analyzeThreshold(data, thresholdField, threshold);
    analysis = csvManager.generateThresholdReport(flaggedRows, thresholdField, threshold);
  } else {
    analysis = `Found ${rowCount} rows`;
  }

  return { csvFilePath, rowCount, analysis, data };
}

/**
 * Sends report to Slack if configured
 *
 * @param slackNotifier - Slack notifier instance (or null)
 * @param messageTemplate - Message template
 * @param startDate - Query start date
 * @param endDate - Query end date
 * @param csvFilePath - Path to CSV file (or null)
 * @param rowCount - Number of rows
 * @param analysis - Analysis string
 * @param csvManager - CSV manager for filename
 * @returns True if sent, false otherwise
 */
async function sendSlackReport(
  slackNotifier: SlackNotifier | null,
  messageTemplate: string,
  startDate: Date,
  endDate: Date,
  csvFilePath: string | null,
  rowCount: number,
  analysis: string,
  csvManager: CSVManager,
): Promise<boolean> {
  if (!slackNotifier) {
    return false;
  }

  const reportData = {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    rowCount,
    fileName: csvManager.getCurrentFileName() ?? 'n/a',
    analysis,
    timestamp: new Date().toISOString(),
  };

  await slackNotifier.sendReport(messageTemplate, reportData, csvFilePath);
  return true;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Main script execution function
 *
 * Executes Athena queries to monitor TPP messages and generates reports
 * with optional Slack notifications.
 *
 * @param script - The GOScript instance for logging and prompts
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<TPPMonitorConfig>();

  // Parse date range with defaults
  const endDate = config.to ? parseDateTime(config.to) : new Date();
  const startDate = config.from ? parseDateTime(config.from) : hoursAgo(24);

  // Validate date range
  if (startDate >= endDate) {
    throw new Error('Start date must be before end date');
  }

  script.logger.section('Time Range');
  script.logger.info(`From: ${startDate.toISOString()}`);
  script.logger.info(`To: ${endDate.toISOString()}`);

  // Initialize Athena service
  script.logger.section('Initializing AWS Athena');
  const athenaService = new AwsAthenaService({
    ssoProfile: config.awsProfile ?? null,
    region: config.awsRegion,
  });

  const athenaExecutor = new AthenaQueryExecutor(athenaService, (msg) => script.logger.info(msg));

  // Initialize CSV Manager
  const csvManager = new CSVManager(config.reportsFolder);

  // Initialize Slack (optional)
  let slackNotifier: SlackNotifier | null = null;
  if (config.slackToken && config.slackChannel) {
    script.logger.section('Initializing Slack');
    slackNotifier = new SlackNotifier(config.slackToken, config.slackChannel);
    await slackNotifier.testConnection();
    script.logger.info('Slack connection verified');
  }

  try {
    // Query template from configuration (loaded automatically from config.yaml by GOScript)
    script.logger.section('Query Template');
    const queryTemplate = config.athenaQuery;
    script.logger.info('Query template loaded from configuration');

    // Build query parameters
    const queryParams = buildQueryParams(startDate, endDate);

    // Build Athena config
    const athenaConfig: AthenaQueryConfig = {
      database: config.athenaDatabase,
      catalog: config.athenaCatalog,
      workGroup: config.athenaWorkgroup,
      outputLocation: config.athenaOutputLocation,
      maxRetries: config.athenaMaxRetries,
      retryDelay: config.athenaRetryDelay,
    };

    // Execute query
    script.logger.section('Executing Athena Query');
    script.prompt.startSpinner('Running query...');
    const results = await executeAthenaQuery(athenaExecutor, queryTemplate, athenaConfig, queryParams);
    script.prompt.spinnerStop('Query completed');

    // Save and analyze results
    script.logger.section('Processing Results');
    const { csvFilePath, rowCount, analysis } = saveAndAnalyzeResults(
      csvManager,
      results,
      config.analysisThresholdField,
      config.analysisThreshold,
    );

    script.logger.info(`Total rows: ${rowCount}`);
    script.logger.info(`Analysis: ${analysis}`);
    if (csvFilePath) {
      script.logger.info(`CSV saved to: ${csvFilePath}`);
    }

    // Send Slack report
    const messageTemplate = config.slackMessageTemplate ?? 'Report generated';
    const slackSent = await sendSlackReport(
      slackNotifier,
      messageTemplate,
      startDate,
      endDate,
      csvFilePath,
      rowCount,
      analysis,
      csvManager,
    );

    // Summary
    script.logger.section('Execution Summary');
    script.logger.info(`CSV report: ${csvFilePath ?? 'N/A (no data)'}`);
    script.logger.info(`Total rows: ${rowCount}`);
    script.logger.info(`Slack notification: ${slackSent ? 'SENT' : 'SKIPPED (not configured)'}`);
  } catch (error) {
    // Attempt to send error to Slack
    if (slackNotifier) {
      try {
        await slackNotifier.sendError('Error during report generation', error instanceof Error ? error : undefined);
      } catch (slackError) {
        script.logger.error(
          `Failed to send error to Slack: ${slackError instanceof Error ? slackError.message : 'Unknown error'}`,
        );
      }
    }
    throw error;
  } finally {
    // Cleanup
    athenaService.destroy();
  }
}
