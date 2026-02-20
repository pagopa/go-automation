/**
 * Lambda handler for SEND Monitor TPP Messages
 *
 * Wraps the existing CLI script logic in a Lambda-compatible handler using
 * GOScript.createLambdaHandler(). The handler:
 * 1. Receives a ScheduledEvent (or custom event with config overrides)
 * 2. Executes the same main() business logic as the CLI script
 * 3. Uploads generated CSV reports to S3 (if REPORTS_S3_BUCKET is set)
 *
 * Configuration:
 * - All script parameters can be passed via env vars (GOEnvironmentConfigProvider)
 *   or via the event payload (GOLambdaEventConfigProvider)
 * - SLACK_TOKEN env var → mapped to slack.token (sensitive: true redacts in logs)
 * - REPORTS_S3_BUCKET env var → S3 bucket for CSV upload
 * - REPORTS_S3_PREFIX env var → S3 key prefix (default: "reports/tpp-monitor")
 * - AWS credentials come from the execution role (no SSO profile needed)
 */

import type { ScheduledEvent } from 'aws-lambda';

import { Core } from '@go-automation/go-common';
import { scriptMetadata, scriptParameters } from 'send-monitor-tpp-messages/config';
import { main } from 'send-monitor-tpp-messages/main';

import { S3Uploader } from './libs/S3Uploader.js';

/**
 * GOScript instance configured with the same metadata and parameters as the CLI script.
 * Instantiated at module scope for Lambda container reuse.
 */
const script = new Core.GOScript({
  metadata: scriptMetadata,
  config: {
    parameters: scriptParameters,
  },
});

/**
 * Lambda handler exported for AWS Lambda runtime.
 *
 * Supports two invocation patterns:
 * - **ScheduledEvent**: EventBridge rule triggers on a cron schedule
 * - **Custom event**: Direct invocation with config overrides in the payload
 *
 * The GOLambdaEventConfigProvider automatically maps event payload keys
 * to configuration parameters (e.g., `startDate` → `start.date`).
 *
 * @example EventBridge scheduled rule (no payload overrides needed)
 * ```json
 * { "source": "aws.events", "detail-type": "Scheduled Event" }
 * ```
 *
 * @example Custom invocation with config overrides
 * ```json
 * { "from": "2024-01-01", "to": "2024-01-31", "athenaDatabase": "my_db" }
 * ```
 */
export const handler = script.createLambdaHandler<ScheduledEvent>(async (_event) => {
  // Execute the main business logic (same as CLI script).
  // Config resolution is handled by GOScript lifecycle:
  // - env vars → GOEnvironmentConfigProvider (SLACK_TOKEN → slack.token, etc.)
  // - event payload → GOLambdaEventConfigProvider (camelCase → dot.notation)
  // - defaults from scriptParameters
  await main(script);

  // Post-execution: upload CSV reports to S3 if configured
  const reportsBucket = process.env['REPORTS_S3_BUCKET'];
  if (reportsBucket) {
    const prefix = process.env['REPORTS_S3_PREFIX'] ?? 'reports/tpp-monitor';
    const reportsDir = '/tmp/reports';

    const uploader = new S3Uploader(reportsBucket);
    const uploaded = await uploader.uploadDirectory(reportsDir, prefix);

    for (const key of uploaded) {
      script.logger.info(`Uploaded: s3://${reportsBucket}/${key}`);
    }
  }
});
