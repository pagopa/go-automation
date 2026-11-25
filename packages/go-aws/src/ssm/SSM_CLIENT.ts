import { SSMClient } from '@aws-sdk/client-ssm';

import type { AWSClientFactory } from '../AWSClientFactory.js';

/**
 * Factory of the `SSMClient`, for `AWSProfileClients.client()`.
 */
export const SSM_CLIENT: AWSClientFactory<SSMClient> = {
  key: 'ssm',
  create: (config) => new SSMClient(config),
};
