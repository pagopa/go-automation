import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GetSecretValueCommand, type SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

import { FakeAwsClient } from '../../__tests__/helpers/FakeAwsClient.js';
import { AWSSecretsManagerService } from '../AWSSecretsManagerService.js';

describe('AWSSecretsManagerService', () => {
  it('reads SecretString with the caller abort signal', async () => {
    const controller = new AbortController();
    const client = new FakeAwsClient([{ SecretString: 'service-password' }]);

    const value = await new AWSSecretsManagerService(client.as<SecretsManagerClient>()).getSecretString(
      'secret-arn',
      controller.signal,
    );

    assert.strictEqual(value, 'service-password');
    assert.deepStrictEqual(client.inputs(GetSecretValueCommand), [{ SecretId: 'secret-arn' }]);
    assert.deepStrictEqual(client.sendOptions, [{ abortSignal: controller.signal }]);
  });
});
