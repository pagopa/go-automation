import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';

import type { AWSClientFactory } from '../AWSClientFactory.js';

/**
 * Factory of the `CloudWatchLogsClient`, for `AWSProfileClients.client()`.
 */
export const CLOUDWATCH_LOGS_CLIENT: AWSClientFactory<CloudWatchLogsClient> = {
  key: 'cloudwatch-logs',
  create: (config) => new CloudWatchLogsClient(config),
};
