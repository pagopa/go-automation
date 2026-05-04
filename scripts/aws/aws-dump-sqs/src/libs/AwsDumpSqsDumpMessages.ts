/**
 * AWS Dump SQS - Dump Messages Library
 */

import { AWS, Core } from '@go-automation/go-common';
import type { AwsDumpSqsConfig } from '../types/index.js';

/**
 * Dumps messages from an SQS queue.
 *
 * @param sqsService - AWS SQS service instance
 * @param queueUrl - SQS queue URL
 * @param config - Dump configuration
 * @param prompt - GOPrompt for progress feedback
 * @returns Result containing dumped messages and statistics
 */

export async function dumpMessages(
  sqsService: AWS.AWSSQSService,
  queueUrl: string,
  config: AwsDumpSqsConfig,
  prompt: Core.GOPrompt,
): Promise<AWS.SQSReceiveResult> {
  prompt.startSpinner('Dumping messages...');

  return sqsService.receiveMessages(
    {
      queueUrl,
      dedupMode: config.dedupMode,
      visibilityTimeout: config.visibilityTimeout,
      maxEmptyReceives: config.maxEmptyReceives,
      limit: config.limit ?? undefined,
    },
    {
      onProgress: (unique, total, duplicates) => {
        prompt.updateSpinner(`Dumped: ${unique} | Received: ${total} | Duplicates: ${duplicates}`);
      },
      onEmptyReceive: (consecutive, max) => {
        prompt.updateSpinner(`Empty receive (${consecutive}/${max})... Still searching...`);
      },
    },
  );
}
