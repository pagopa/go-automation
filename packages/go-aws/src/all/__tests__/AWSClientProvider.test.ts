import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { STSClient } from '@aws-sdk/client-sts';

import { ATHENA_CLIENT } from '../../athena/ATHENA_CLIENT.js';
import type { AWSClientFactory } from '../../AWSClientFactory.js';
import type { AWSDestroyableClient } from '../../AWSDestroyableClient.js';
import { CLOUDWATCH_LOGS_CLIENT } from '../../cloudwatch-logs/CLOUDWATCH_LOGS_CLIENT.js';
import { CLOUDWATCH_CLIENT } from '../../cloudwatch-metrics/CLOUDWATCH_CLIENT.js';
import { DYNAMODB_CLIENT } from '../../dynamodb/DYNAMODB_CLIENT.js';
import { EC2_CLIENT } from '../../ec2/EC2_CLIENT.js';
import { ECS_CLIENT } from '../../ecs/ECS_CLIENT.js';
import { LAMBDA_CLIENT } from '../../lambda/LAMBDA_CLIENT.js';
import { S3_CLIENT } from '../../s3/S3_CLIENT.js';
import { SCHEDULER_CLIENT } from '../../scheduler/SCHEDULER_CLIENT.js';
import { SECRETS_MANAGER_CLIENT } from '../../secrets-manager/SECRETS_MANAGER_CLIENT.js';
import { SQS_CLIENT } from '../../sqs/SQS_CLIENT.js';
import { SSM_CLIENT } from '../../ssm/SSM_CLIENT.js';
import { STS_CLIENT } from '../../STS_CLIENT.js';
import { AWSClientProvider } from '../AWSClientProvider.js';

/** Client getters of the aggregate. */
type ClientGetter =
  | 's3'
  | 'dynamoDB'
  | 'cloudWatch'
  | 'cloudWatchLogs'
  | 'athena'
  | 'sqs'
  | 'ecs'
  | 'lambda'
  | 'secretsManager'
  | 'scheduler'
  | 'ssm'
  | 'sts';

/** Each client getter of the aggregate and the factory it must be served from. */
const GETTERS: ReadonlyArray<readonly [ClientGetter, AWSClientFactory<AWSDestroyableClient>]> = [
  ['s3', S3_CLIENT],
  ['dynamoDB', DYNAMODB_CLIENT],
  ['cloudWatch', CLOUDWATCH_CLIENT],
  ['cloudWatchLogs', CLOUDWATCH_LOGS_CLIENT],
  ['athena', ATHENA_CLIENT],
  ['sqs', SQS_CLIENT],
  ['ecs', ECS_CLIENT],
  ['lambda', LAMBDA_CLIENT],
  ['secretsManager', SECRETS_MANAGER_CLIENT],
  ['scheduler', SCHEDULER_CLIENT],
  ['ssm', SSM_CLIENT],
  ['sts', STS_CLIENT],
];

describe('AWSClientProvider — aggregate over the profile client cache', () => {
  it('serves every client getter from the per-profile cache of its factory', () => {
    const provider = new AWSClientProvider({ region: 'eu-south-1' });

    for (const [getter, factory] of GETTERS) {
      assert.strictEqual(provider[getter], provider.client(factory), getter);
    }
    provider.close();
  });

  it('exposes EC2 only through client(EC2_CLIENT), cached and released on close', async () => {
    const provider = new AWSClientProvider({ region: 'eu-south-1' });

    assert.strictEqual('ec2' in provider, false, 'no ec2 getter on the aggregate');
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
          send: async () => Promise.resolve({ Account: '123456789012' }),
          destroy: () => undefined,
        }) as unknown as STSClient,
    );
    const provider = new AWSClientProvider({ profile: 'profile-prod', region: 'eu-central-1' });

    assert.strictEqual(provider.getProfile(), 'profile-prod');
    assert.strictEqual(provider.getRegion(), 'eu-central-1');
    assert.strictEqual(await provider.resolveAccountId(), '123456789012');
  });
});
