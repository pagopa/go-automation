import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';

import type { AWSClientFactory } from '../AWSClientFactory.js';

/**
 * Factory of the `CloudWatchClient`, for `AWSProfileClients.client()`.
 */
export const CLOUDWATCH_CLIENT: AWSClientFactory<CloudWatchClient> = {
  key: 'cloudwatch',
  create: (config) => new CloudWatchClient(config),
};
