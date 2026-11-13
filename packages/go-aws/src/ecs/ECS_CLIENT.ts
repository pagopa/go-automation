import { ECSClient } from '@aws-sdk/client-ecs';

import type { AWSClientFactory } from '../AWSClientFactory.js';

/**
 * Factory of the `ECSClient`, for `AWSProfileClients.client()`.
 */
export const ECS_CLIENT: AWSClientFactory<ECSClient> = {
  key: 'ecs',
  create: (config) => new ECSClient(config),
};
