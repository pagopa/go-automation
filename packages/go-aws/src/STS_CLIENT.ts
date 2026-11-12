import { STSClient } from '@aws-sdk/client-sts';

import type { AWSClientFactory } from './AWSClientFactory.js';

/**
 * Factory of the STS client, used to resolve the account id of a profile.
 */
export const STS_CLIENT: AWSClientFactory<STSClient> = {
  key: 'sts',
  create: (config) => new STSClient(config),
};
