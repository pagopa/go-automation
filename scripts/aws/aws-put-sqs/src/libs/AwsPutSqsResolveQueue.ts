/**
 * AWS Put SQS - Resolve Queue
 */

import { Core, AWS } from '@go-automation/go-common';
import type { AwsPutSqsConfig } from '../types/AwsPutSqsConfig.js';

/**
 * Resolve queue URL from configuration
 * @param script - GOScript instance
 * @param config - Script configuration
 * @returns Promise with queue URL
 */
export async function resolveQueue(script: Core.GOScript, config: AwsPutSqsConfig): Promise<{ queueUrl: string }> {
  script.logger.section('Initialization');

  const queueNameOrUrl = config.queueUrl ?? config.queueName;
  if (!queueNameOrUrl) {
    throw new Error('Either --queue-name or --queue-url must be provided');
  }

  const sqsService = new AWS.AWSSQSService(script.aws.sqs, script.aws.cloudWatch);
  const metadata = await sqsService.resolveQueueMetadata(queueNameOrUrl);

  script.logger.info(`Target Queue: ${metadata.queueUrl}`);
  script.logger.info(`Input File: ${config.inputFile}`);

  return { queueUrl: metadata.queueUrl };
}
