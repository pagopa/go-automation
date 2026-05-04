/**
 * AWS Delete SQS - Confirm Action Library
 */

import { Core } from '@go-automation/go-common';
import type { AwsDeleteSqsConfig } from '../types/index.js';

/**
 * Confirm action to delete messages from SQS queue
 * @param config - Configuration for the script
 * @param metadata - Metadata for the queue
 * @param targetIds - Set of message IDs to delete
 * @param script - Script instance
 * @returns Promise<boolean> - True if action is confirmed, false otherwise
 */

export async function confirmAction(
  config: AwsDeleteSqsConfig,
  metadata: { queueUrl: string },
  targetIds: Set<string> | undefined,
  script: Core.GOScript,
): Promise<boolean> {
  const actionDescription = config.purgeAll ? 'PURGE ALL messages' : `DELETE ${targetIds?.size ?? 0} specific messages`;

  const confirmed = await script.prompt.confirm(
    `Are you sure you want to ${actionDescription} from queue "${metadata.queueUrl}"?`,
    false,
  );

  if (confirmed === undefined) {
    script.logger.error('Error: No confirmation received.');
    throw new Error('No confirmation received.');
  }

  return confirmed;
}
