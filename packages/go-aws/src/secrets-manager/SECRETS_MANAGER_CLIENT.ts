import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

import type { AWSClientFactory } from '../AWSClientFactory.js';

/**
 * Factory of the `SecretsManagerClient`, for `AWSProfileClients.client()`.
 */
export const SECRETS_MANAGER_CLIENT: AWSClientFactory<SecretsManagerClient> = {
  key: 'secrets-manager',
  create: (config) => new SecretsManagerClient(config),
};
