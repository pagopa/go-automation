import { SQSClient } from '@aws-sdk/client-sqs';

import type { AWSClientFactory } from '../AWSClientFactory.js';

/**
 * Factory of the `SQSClient`, for `AWSProfileClients.client()`.
 */
export const SQS_CLIENT: AWSClientFactory<SQSClient> = {
  key: 'sqs',
  create: (config) => new SQSClient(config),
};
