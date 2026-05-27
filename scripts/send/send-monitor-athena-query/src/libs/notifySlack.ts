import { Core } from '@go-automation/go-common';

import { buildSlackReportData } from './buildSlackReportData.js';
import type { ReportArtifact, ReportFormat, SendMonitorAthenaQueryConfig, TimeRange } from '../types/index.js';
import type { AWS } from '@go-automation/go-common';

export async function notifySlackIfConfigured(
  script: Core.GOScript,
  config: SendMonitorAthenaQueryConfig,
  timeRange: TimeRange,
  athenaResult: AWS.AWSAthenaQueryResult,
  artifact: ReportArtifact,
  evaluation: Core.GOThresholdEvaluation,
): Promise<boolean> {
  const slackConfig = getSlackConfig(config);
  if (slackConfig === undefined) {
    script.logger.info('Slack notification skipped: slack.token/slack.channel not configured');
    return false;
  }

  if (athenaResult.rowCount === 0 && !config.slackSendOnEmpty) {
    script.logger.info('Slack notification skipped: query returned zero rows and slack.send.on.empty=false');
    return false;
  }

  const messenger = Core.createSlackMessenger(slackConfig);
  const attachments = buildAttachments(config, artifact);
  const reportData = buildSlackReportData(timeRange, athenaResult, artifact, evaluation, config.timeZone);
  const receipt = await messenger.sendReport(config.slackMessageTemplate, reportData, attachments);

  if (!receipt.success) {
    script.logger.warning(`Slack notification failed: ${receipt.error ?? 'unknown error'}`);
    return false;
  }

  return true;
}

export async function notifySlackErrorIfConfigured(
  script: Core.GOScript,
  config: SendMonitorAthenaQueryConfig,
  error: unknown,
): Promise<void> {
  if (!config.slackSendOnError) {
    return;
  }

  const slackConfig = getSlackConfig(config);
  if (slackConfig === undefined) {
    return;
  }

  try {
    const messenger = Core.createSlackMessenger(slackConfig);
    await messenger.sendError(
      'Athena monitor execution failed',
      error instanceof Error ? error : new Error(String(error)),
    );
  } catch (slackError) {
    script.logger.error(
      `Failed to send Slack error notification: ${slackError instanceof Error ? slackError.message : String(slackError)}`,
    );
  }
}

function getSlackConfig(config: SendMonitorAthenaQueryConfig): Core.GOSlackMessengerOptions | undefined {
  const token = config.slackToken?.trim();
  const channel = config.slackChannel?.trim();

  if (token === undefined || token.length === 0 || channel === undefined || channel.length === 0) {
    return undefined;
  }

  return { token, channel };
}

function buildAttachments(
  config: SendMonitorAthenaQueryConfig,
  artifact: ReportArtifact,
): ReadonlyArray<Core.GOOutboundAttachment> | undefined {
  if (artifact.rowCount === 0 && !config.outputAttachWhenEmpty) {
    return undefined;
  }

  return [
    {
      filePath: artifact.filePath,
      fileName: artifact.fileName,
      title: artifact.fileName,
      mimeType: mimeTypeForFormat(artifact.format),
    },
  ];
}

function mimeTypeForFormat(format: ReportFormat): string {
  switch (format) {
    case 'csv':
      return 'text/csv';
    case 'json':
      return 'application/json';
    case 'jsonl':
      return 'application/x-ndjson';
    default:
      throw new Error(`Unsupported report format: ${Core.valueToString(format)}`);
  }
}
