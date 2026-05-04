/**
 * AWS Dump SQS - Resolve Queue URL Library
 */

import { Core } from '@go-automation/go-common';
import type { AwsDumpSqsConfig } from '../types/index.js';
import { initializeQueue } from './AwsDumpSqsInitializeQueue.js';

/**
 * Resolves the SQS queue URL, initializing or verifying the queue as needed.
 *
 * @param config - Dump configuration
 * @param script - Script context containing AWS and prompt utilities
 * @returns Resolved SQS queue URL
 */

export async function resolveQueueUrl(config: AwsDumpSqsConfig, script: Core.GOScript): Promise<string> {
  const queueNameOrUrl = config.queueUrl ?? config.queueName;
  if (!queueNameOrUrl) {
    throw new Error('Either --queue-name or --queue-url must be provided');
  }

  const { queueUrl } = await initializeQueue(
    script.aws.sqs,
    script.aws.cloudWatch,
    queueNameOrUrl,
    script.prompt,
    script.logger,
  );

  return queueUrl;
}
