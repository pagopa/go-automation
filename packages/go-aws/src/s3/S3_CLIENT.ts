import { S3Client } from '@aws-sdk/client-s3';

import type { AWSClientFactory } from '../AWSClientFactory.js';

/**
 * Factory of the `S3Client`, for `AWSProfileClients.client()`.
 */
export const S3_CLIENT: AWSClientFactory<S3Client> = {
  key: 's3',
  create: (config) => new S3Client(config),
};
