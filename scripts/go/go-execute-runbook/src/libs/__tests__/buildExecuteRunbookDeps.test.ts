import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AWS, Core } from '@go-automation/go-common';

import type { ExecuteRunbookConfig } from '../../types/ExecuteRunbookConfig.js';
import { buildExecuteRunbookDeps } from '../buildExecuteRunbookDeps.js';

const BASE_CONFIG: ExecuteRunbookConfig = {
  watchtowerUrl: 'http://localhost:3001',
  watchtowerServiceId: 'runbook-worker',
};

describe('buildExecuteRunbookDeps', () => {
  it('trims an inline Watchtower service password', async () => {
    let secretReads = 0;
    const deps = await buildExecuteRunbookDeps(
      fakeScript(async () => {
        secretReads += 1;
        return 'secret-from-aws';
      }),
      { ...BASE_CONFIG, watchtowerPassword: '  pippo  ', watchtowerServiceSecretArn: 'arn:unused' },
    );

    assert.strictEqual(servicePassword(deps.watchtower), 'pippo');
    assert.strictEqual(secretReads, 0);
  });

  it('trims the Watchtower service secret ARN before reading Secrets Manager', async () => {
    let requestedArn = '';
    await buildExecuteRunbookDeps(
      fakeScript(async (arn) => {
        requestedArn = arn;
        return 'secret-from-aws';
      }),
      { ...BASE_CONFIG, watchtowerServiceSecretArn: '  arn:aws:secretsmanager:eu-south-1:123:secret:watchtower  ' },
    );

    assert.strictEqual(requestedArn, 'arn:aws:secretsmanager:eu-south-1:123:secret:watchtower');
  });

  it('rejects whitespace-only Watchtower credentials as a configuration error', async () => {
    await assert.rejects(
      buildExecuteRunbookDeps(
        fakeScript(async () => 'secret-from-aws'),
        {
          ...BASE_CONFIG,
          watchtowerPassword: '   ',
          watchtowerServiceSecretArn: '   ',
        },
      ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /password or secret ARN is required/);
        assert.strictEqual(
          (error as { readonly workerFailureCode?: unknown }).workerFailureCode,
          'WORKER_CONFIGURATION_ERROR',
        );
        return true;
      },
    );
  });
});

function fakeScript(getSecretString: (arn: string) => Promise<string>): Core.GOScript {
  return {
    environment: { isAWSManaged: false },
    logger: {} as Core.GOLogger,
    aws: {
      services: {
        cloudWatchLogs: {} as AWS.AWSCloudWatchLogsService,
        cloudWatchMetrics: {} as AWS.AWSCloudWatchMetricsService,
        athena: {} as AWS.AWSAthenaService,
        dynamoDB: {} as AWS.AWSDynamoDBService,
        secretsManager: { getSecretString },
      },
    },
  } as unknown as Core.GOScript;
}

function servicePassword(watchtower: unknown): string {
  return (
    watchtower as {
      readonly auth: { readonly credentials: { readonly kind: 'SERVICE'; readonly password: string } };
    }
  ).auth.credentials.password;
}
