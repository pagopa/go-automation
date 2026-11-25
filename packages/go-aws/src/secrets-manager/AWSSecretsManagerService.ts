import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import type { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

/** Reads string secrets through the shared AWS provider and default credential chain. */
export class AWSSecretsManagerService {
  constructor(private readonly client: SecretsManagerClient) {}

  async getSecretString(secretId: string, signal?: AbortSignal): Promise<string> {
    if (secretId.trim() === '') throw new Error('Secrets Manager secret id cannot be empty');
    const response = await this.client.send(
      new GetSecretValueCommand({ SecretId: secretId }),
      signal === undefined ? {} : { abortSignal: signal },
    );
    if (response.SecretString === undefined || response.SecretString === '') {
      throw new Error(`Secrets Manager secret ${secretId} does not contain a SecretString`);
    }
    return response.SecretString;
  }
}
