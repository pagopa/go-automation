import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GetParameterCommand, type SSMClient } from '@aws-sdk/client-ssm';

import { FakeAwsClient } from '../../__tests__/helpers/FakeAwsClient.js';
import { AWSSSMService } from '../AWSSSMService.js';

describe('AWSSSMService', () => {
  it('reads the parameter value, decrypting unless told otherwise', async () => {
    const client = new FakeAwsClient([{ Parameter: { Value: 'secret' } }, { Parameter: { Value: 'plain' } }]);
    const service = new AWSSSMService(client.as<SSMClient>());

    assert.strictEqual(await service.getParameterStoreValue('/app/secret'), 'secret');
    assert.strictEqual(await service.getParameterStoreValue('/app/plain', false), 'plain');
    assert.deepStrictEqual(client.inputs(GetParameterCommand), [
      { Name: '/app/secret', WithDecryption: true },
      { Name: '/app/plain', WithDecryption: false },
    ]);
  });

  it('returns undefined when the parameter or its value is missing', async () => {
    const client = new FakeAwsClient([{}, { Parameter: { Name: '/app/empty' } }]);
    const service = new AWSSSMService(client.as<SSMClient>());

    assert.strictEqual(await service.getParameterStoreValue('/app/missing'), undefined);
    assert.strictEqual(await service.getParameterStoreValue('/app/empty'), undefined);
  });
});
