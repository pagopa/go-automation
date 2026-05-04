/**
 * AWS Delete SQS - Resolve Queue ID Library
 */

import type { AwsDeleteSqsConfig } from '../types/index.js';

/**
 * Resolve queue identifier from configuration
 * @param config - Configuration for the script
 * @returns string - Queue identifier (URL or name)
 */

export function resolveQueueIdentifier(config: AwsDeleteSqsConfig): string {
  const identifier = config.queueUrl ?? config.queueName;
  if (!identifier) {
    throw new Error('Either --queue-name or --queue-url must be provided');
  }
  return identifier;
}
