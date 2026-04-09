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
  convertAthenaResults,
  SlackNotifier,
  parseDateTime,
  hoursAgo,
} from './libs/index.js';
import { buildQueryParams } from './libs/buildQueryParams.js';
import { saveAndAnalyzeResults } from './libs/saveAndAnalyzeResults.js';
import { sendSlackReport, notifySlackError } from './libs/sendSlackReport.js';
import type { AthenaQueryConfig } from './types/AthenaQueryConfig.js';
import type { TPPMonitorConfig } from './types/TPPMonitorConfig.js';

/**
 * Main script execution function.
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
  const reportsPath = script.paths.resolvePath(config.reportsFolder, Core.GOPathType.OUTPUT) ?? config.reportsFolder;

  // Initialize Slack (optional)
  let slackNotifier: SlackNotifier | null = null;
  if (config.slackToken && config.slackChannel) {
    script.logger.section('Initializing Slack');
    slackNotifier = new SlackNotifier(config.slackToken, config.slackChannel);
    await slackNotifier.testConnection();
    script.logger.info('Slack connection verified');
  }

  try {
    // Build query config and parameters
    const queryParams = buildQueryParams(startDate, endDate);
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
    const results = await athenaExecutor.executeQuery(config.athenaQuery, athenaConfig, queryParams);
    script.prompt.spinnerStop('Query completed');

    // Save and analyze results
    script.logger.section('Processing Results');
    const data = convertAthenaResults(results);
    const { csvFilePath, fileName, rowCount, analysis } = await saveAndAnalyzeResults(
      data,
      reportsPath,
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
      fileName,
    );

    // Summary
    script.logger.section('Execution Summary');
    script.logger.info(`CSV report: ${csvFilePath ?? 'N/A (no data)'}`);
    script.logger.info(`Total rows: ${rowCount}`);
    script.logger.info(`Slack notification: ${slackSent ? 'SENT' : 'SKIPPED (not configured)'}`);
  } catch (error) {
    await notifySlackError(slackNotifier, error, script);
    throw error;
  } finally {
    athenaService.destroy();
  }
}
