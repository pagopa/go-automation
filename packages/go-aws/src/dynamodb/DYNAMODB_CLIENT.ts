import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

import type { AWSClientFactory } from '../AWSClientFactory.js';

/**
 * Factory of the `DynamoDBClient`, for `AWSProfileClients.client()`.
 */
export const DYNAMODB_CLIENT: AWSClientFactory<DynamoDBClient> = {
  key: 'dynamodb',
  create: (config) => new DynamoDBClient(config),
};
