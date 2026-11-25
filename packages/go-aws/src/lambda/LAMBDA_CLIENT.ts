import { LambdaClient } from '@aws-sdk/client-lambda';

import type { AWSClientFactory } from '../AWSClientFactory.js';

/**
 * Factory of the `LambdaClient`, for `AWSProfileClients.client()`.
 */
export const LAMBDA_CLIENT: AWSClientFactory<LambdaClient> = {
  key: 'lambda',
  create: (config) => new LambdaClient(config),
};
