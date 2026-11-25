import { SchedulerClient } from '@aws-sdk/client-scheduler';

import type { AWSClientFactory } from '../AWSClientFactory.js';

/**
 * Factory of the `SchedulerClient`, for `AWSProfileClients.client()`.
 */
export const SCHEDULER_CLIENT: AWSClientFactory<SchedulerClient> = {
  key: 'scheduler',
  create: (config) => new SchedulerClient(config),
};
