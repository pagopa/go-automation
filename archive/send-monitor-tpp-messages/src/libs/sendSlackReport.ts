/**
 * Slack notification helpers for monitoring reports.
 */

import { Core } from '@go-automation/go-common';

import { SlackNotifier } from './SlackNotifier.js';

/**
 * Sends report to Slack if a notifier is configured.
 *
 * @param slackNotifier - Slack notifier instance (or null if not configured)
 * @param messageTemplate - Message template
 * @param startDate - Query start date
 * @param endDate - Query end date
 * @param csvFilePath - Path to CSV file (or null)
 * @param rowCount - Number of rows
 * @param analysis - Analysis string
 * @param fileName - CSV filename (or null)
 * @returns True if sent, false otherwise
 */
export async function sendSlackReport(
  slackNotifier: SlackNotifier | null,
  messageTemplate: string,
  startDate: Date,
  endDate: Date,
  csvFilePath: string | null,
  rowCount: number,
  analysis: string,
  fileName: string | null,
): Promise<boolean> {
  if (!slackNotifier) {
    return false;
  }

  const reportData = {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    rowCount,
    fileName: fileName ?? 'n/a',
    analysis,
    timestamp: new Date().toISOString(),
  };

  await slackNotifier.sendReport(messageTemplate, reportData, csvFilePath);
  return true;
}

/**
 * Attempts to send an error notification to Slack.
 * Silently logs any Slack delivery failures without re-throwing.
 *
 * @param slackNotifier - Slack notifier instance (or null if not configured)
 * @param error - The original error to report
 * @param script - GOScript instance for logging fallback errors
 */
export async function notifySlackError(
  slackNotifier: SlackNotifier | null,
  error: unknown,
  script: Core.GOScript,
): Promise<void> {
  if (!slackNotifier) {
    return;
  }

  try {
    await slackNotifier.sendError('Error during report generation', error instanceof Error ? error : undefined);
  } catch (slackError) {
    script.logger.error(
      `Failed to send error to Slack: ${slackError instanceof Error ? slackError.message : 'Unknown error'}`,
    );
  }
}
