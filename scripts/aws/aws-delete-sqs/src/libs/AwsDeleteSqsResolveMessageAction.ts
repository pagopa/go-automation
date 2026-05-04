/**
 * AWS Delete SQS - Resolve Message Action Library
 */

import { AWS } from '@go-automation/go-common';
import type { AwsDeleteSqsConfig } from '../types/index.js';

/**
 * Resolve action for a message based on configuration and target IDs
 * @param message - Message to resolve
 * @param config - Configuration for the script
 * @param targetIds - Set of message IDs to delete
 * @returns Promise<AWS.SQSProcessAction> - Action to take for the message
 */

export function resolveMessageAction(
  message: AWS.Message,
  config: AwsDeleteSqsConfig,
  targetIds: Set<string> | undefined,
): AWS.SQSProcessAction {
  if (config.purgeAll) return AWS.SQSProcessAction.DELETE;
  if (message.MessageId && targetIds?.has(message.MessageId)) return AWS.SQSProcessAction.DELETE;
  return AWS.SQSProcessAction.RELEASE;
}
