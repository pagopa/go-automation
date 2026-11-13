import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { STSClient } from '@aws-sdk/client-sts';

import { EC2_CLIENT } from '../../ec2/EC2_CLIENT.js';
import { S3_CLIENT } from '../../s3/S3_CLIENT.js';
import { STS_CLIENT } from '../../STS_CLIENT.js';
import { AWSClientProvider } from '../AWSClientProvider.js';

describe('AWSClientProvider — aggregate over the profile client cache', () => {
  it('serves getters and client(factory) from the same per-profile cache', () => {
    const provider = new AWSClientProvider({ region: 'eu-south-1' });

    assert.strictEqual(provider.s3, provider.client(S3_CLIENT));
    assert.strictEqual(provider.s3, provider.s3, 'the client is cached');
    provider.close();
  });

  it('exposes EC2 only through client(EC2_CLIENT), cached and released on close', async () => {
    const provider = new AWSClientProvider({ region: 'eu-south-1' });

    assert.strictEqual('ec2' in provider, false, 'no ec2 getter on the aggregate (D5)');
    const first = provider.client(EC2_CLIENT);
    assert.strictEqual(provider.client(EC2_CLIENT), first, 'the client is cached');
    assert.strictEqual(await first.config.region(), 'eu-south-1');

    provider.close();
    assert.notStrictEqual(provider.client(EC2_CLIENT), first, 'close() drops the cached client');
    provider.close();
  });

  it('delegates profile, region and account identity to the cache', async (t) => {
    t.mock.method(
      STS_CLIENT,
      'create',
      () =>
        ({
          send: async () => {
            await Promise.resolve();
            return { Account: '333333333333' };
          },
          destroy: () => undefined,
        }) as unknown as STSClient,
    );
    const provider = new AWSClientProvider({ profile: 'sso_prod', region: 'eu-central-1' });

    assert.strictEqual(provider.getProfile(), 'sso_prod');
    assert.strictEqual(provider.getRegion(), 'eu-central-1');
    assert.strictEqual(await provider.resolveAccountId(), '333333333333');
  });
});
