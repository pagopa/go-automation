/**
 * AWS Dump SQS - Main Logic Module
 */

import { Core, AWS } from '@go-automation/go-common';
import type { AwsDumpSqsConfig } from './types/index.js';
import {
  warnVisibilityTimeout,
  resolveOutputPath,
  resolveQueueUrl,
  dumpMessages,
  exportIfNonEmpty,
  formatCompletionSummary,
} from './libs/index.js';

/**
 * Main script execution function.
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<AwsDumpSqsConfig>();

  /** Section title */
  script.logger.section('AWS Dump SQS');

  /** Warn about visibility timeout */
  warnVisibilityTimeout(config, script.logger);

  /** Resolve output path */
  const outputPathInfo = resolveOutputPath(config, script);
  script.logger.info(`Output file: ${outputPathInfo.path}`);
  script.logger.newline();

  /** Resolve queue URL */
  const queueUrl = await resolveQueueUrl(config, script);

  /** Initialize SQS service */
  const sqsService = new AWS.AWSSQSService(script.aws.sqs, script.aws.cloudWatch);

  /** Dump messages */
  const result = await dumpMessages(sqsService, queueUrl, config, script.prompt);

  /** Export if non empty */
  await exportIfNonEmpty(result.messages, outputPathInfo.path);

  /** Stop spinner and print summary */
  script.prompt.spinnerStop(formatCompletionSummary(result, outputPathInfo.path));
}
