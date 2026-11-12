import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import type { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

import { AWSSecretsManagerService } from '../AWSSecretsManagerService.js';

describe('AWSSecretsManagerService', () => {
  it('reads SecretString with the caller abort signal', async () => {
    const controller = new AbortController();
    const client = {
      send: async (command: GetSecretValueCommand, options: { readonly abortSignal?: AbortSignal }) => {
        assert.ok(command instanceof GetSecretValueCommand);
        assert.strictEqual(options.abortSignal, controller.signal);
        await Promise.resolve();
        return { SecretString: 'service-password' };
      },
    } as unknown as SecretsManagerClient;

    const value = await new AWSSecretsManagerService(client).getSecretString('secret-arn', controller.signal);

    assert.strictEqual(value, 'service-password');
  });
});
