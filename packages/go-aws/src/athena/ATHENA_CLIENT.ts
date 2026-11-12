import { AthenaClient } from '@aws-sdk/client-athena';

import type { AWSClientFactory } from '../AWSClientFactory.js';

/**
 * Factory of the `AthenaClient`, for `AWSProfileClients.client()`.
 */
export const ATHENA_CLIENT: AWSClientFactory<AthenaClient> = {
  key: 'athena',
  create: (config) => new AthenaClient(config),
};
