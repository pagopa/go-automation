import { EC2Client } from '@aws-sdk/client-ec2';

import type { AWSClientFactory } from '../AWSClientFactory.js';

/**
 * Factory of the `EC2Client`, for `AWSProfileClients.client()`.
 */
export const EC2_CLIENT: AWSClientFactory<EC2Client> = {
  key: 'ec2',
  create: (config) => new EC2Client(config),
};
