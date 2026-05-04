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

export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<AwsDumpSqsConfig>();

  script.logger.section('AWS Dump SQS');

  warnVisibilityTimeout(config, script.logger);

  const outputPathInfo = resolveOutputPath(config, script);
  script.logger.info(`Output file: ${outputPathInfo.path}`);
  script.logger.newline();

  const queueUrl = await resolveQueueUrl(config, script);
  const sqsService = new AWS.AWSSQSService(script.aws.sqs, script.aws.cloudWatch);

  const result = await dumpMessages(sqsService, queueUrl, config, script.prompt);

  await exportIfNonEmpty(result.messages, outputPathInfo.path);

  script.prompt.spinnerStop(formatCompletionSummary(result, outputPathInfo.path));
}
