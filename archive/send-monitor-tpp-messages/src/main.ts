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
  SlackNotifier,
  parseDateTime,
  hoursAgo,
  runMonitoringCycle,
} from './libs/index.js';
import { notifySlackError } from './libs/sendSlackReport.js';
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
    await runMonitoringCycle(script, config, athenaExecutor, slackNotifier, reportsPath, startDate, endDate);
  } catch (error) {
    await notifySlackError(slackNotifier, error, script);
    throw error;
  } finally {
    // Keep the Athena client alive only for Lambda warm starts where the same
    // execution environment may be reused across invocations. In all other
    // environments — including ECS/Fargate one-shot tasks — destroy it so open
    // sockets do not delay process exit.
    const keepClientAlive = script.environment.type === Core.GOExecutionEnvironmentType.AWS_LAMBDA;
    if (!keepClientAlive) {
      athenaService.destroy();
    }
  }
}
