import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GetParameterCommand, type SSMClient } from '@aws-sdk/client-ssm';

import { AWSSSMService } from '../AWSSSMService.js';

describe('AWSSSMService', () => {
  it('retrieves parameter value using default decryption (true)', async () => {
    const sentCommands: GetParameterCommand[] = [];
    const client = {
      send: async (command: GetParameterCommand) => {
        sentCommands.push(command);
        await Promise.resolve();
        return {
          Parameter: {
            Name: '/app/config/param1',
            Value: 'decrypted-secret-value',
          },
        };
      },
    } as unknown as SSMClient;

    const service = new AWSSSMService(client);
    const value = await service.getParameterStoreValue('/app/config/param1');

    assert.strictEqual(value, 'decrypted-secret-value');
    assert.strictEqual(sentCommands.length, 1);
    assert.ok(sentCommands[0] instanceof GetParameterCommand);
    assert.deepStrictEqual(sentCommands[0].input, {
      Name: '/app/config/param1',
      WithDecryption: true,
    });
  });

  it('retrieves parameter value with withDecryption set to false', async () => {
    const sentCommands: GetParameterCommand[] = [];
    const client = {
      send: async (command: GetParameterCommand) => {
        sentCommands.push(command);
        await Promise.resolve();
        return {
          Parameter: {
            Name: '/app/config/plain-param',
            Value: 'plain-value',
          },
        };
      },
    } as unknown as SSMClient;

    const service = new AWSSSMService(client);
    const value = await service.getParameterStoreValue('/app/config/plain-param', false);

    assert.strictEqual(value, 'plain-value');
    assert.strictEqual(sentCommands.length, 1);
    assert.ok(sentCommands[0] instanceof GetParameterCommand);
    assert.deepStrictEqual(sentCommands[0].input, {
      Name: '/app/config/plain-param',
      WithDecryption: false,
    });
  });

  it('returns undefined when parameter is not present in response', async () => {
    const client = {
      send: async () => {
        await Promise.resolve();
        return {};
      },
    } as unknown as SSMClient;

    const service = new AWSSSMService(client);
    const value = await service.getParameterStoreValue('/app/non-existent');

    assert.strictEqual(value, undefined);
  });

  it('returns undefined when parameter exists but has no Value', async () => {
    const client = {
      send: async () => {
        await Promise.resolve();
        return {
          Parameter: {
            Name: '/app/empty',
          },
        };
      },
    } as unknown as SSMClient;

    const service = new AWSSSMService(client);
    const value = await service.getParameterStoreValue('/app/empty');

    assert.strictEqual(value, undefined);
  });

  it('propagates client errors when send rejects', async () => {
    const ssmError = new Error('ParameterNotFound: The parameter was not found.');
    const client = {
      send: async () => {
        await Promise.resolve();
        throw ssmError;
      },
    } as unknown as SSMClient;

    const service = new AWSSSMService(client);

    await assert.rejects(
      async () => {
        await service.getParameterStoreValue('/app/missing');
      },
      (err: unknown) => {
        assert.strictEqual(err, ssmError);
        return true;
      },
    );
  });
});
