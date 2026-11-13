import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GOScript } from '@go-automation/go-script';
import type { AWSAthenaService } from '@pagopa/go-aws/athena';
import type { AWSCloudWatchLogsService } from '@pagopa/go-aws/cloudwatch-logs';
import type { AWSCloudWatchMetricsService } from '@pagopa/go-aws/cloudwatch-metrics';
import type { AWSDynamoDBService } from '@pagopa/go-aws/dynamodb';
import type { GOLogger } from '@pagopa/go-common/logging';

import type { ExecuteRunbookConfig } from '../../types/ExecuteRunbookConfig.js';
import { isAwsAccountError } from '@pagopa/go-runbook/toolkits/common';
import { RuntimeAwsAccountsPort } from '@pagopa/go-runbook/runtime';
import { buildExecuteRunbookDeps } from '../buildExecuteRunbookDeps.js';

type FakeSecretStringLoaderFn = (arn: string) => string | Promise<string>;

const BASE_CONFIG: ExecuteRunbookConfig = {
  watchtowerUrl: 'http://localhost:3001',
  watchtowerServiceId: 'runbook-worker',
};

describe('buildExecuteRunbookDeps', () => {
  it('requires and trims the worker artifact revision in AWS-managed execution', async () => {
    await assert.rejects(
      buildExecuteRunbookDeps(
        fakeScript(() => 'secret-from-aws', true),
        BASE_CONFIG,
      ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /worker artifact revision is required/u);
        assert.strictEqual(
          (error as { readonly workerFailureCode?: unknown }).workerFailureCode,
          'WORKER_CONFIGURATION_ERROR',
        );
        return true;
      },
    );

    const deps = await buildExecuteRunbookDeps(
      fakeScript(() => 'unused-secret', true),
      {
        ...BASE_CONFIG,
        watchtowerPassword: 'service-password',
        executeRunbookArtifactRevision: '  build-abc123  ',
      },
    );
    assert.strictEqual(deps.workerArtifactRevision, 'build-abc123');
  });

  it('trims an inline Watchtower service password', async () => {
    let secretReads = 0;
    const deps = await buildExecuteRunbookDeps(
      fakeScript(() => {
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
      fakeScript((arn) => {
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
        fakeScript(() => 'secret-from-aws'),
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

  it('uses a trimmed scoped human token for CLI PAT authentication', async () => {
    const deps = await buildExecuteRunbookDeps(
      fakeScript(() => 'unused-service-secret'),
      { ...BASE_CONFIG, watchtowerHumanToken: '  wtcli_token  ' },
      { auth: 'CLI_PAT' },
    );

    assert.strictEqual(cliPatToken(deps.watchtower), 'wtcli_token');
  });
});

describe('buildExecuteRunbookDeps — logical AWS accounts (EVO-AWSACCT-OPUS-01)', () => {
  const managed = { ...BASE_CONFIG, executeRunbookArtifactRevision: 'build-1', watchtowerPassword: 'secret' };

  it('adds the account port, reading through OAM in AWS-managed execution', async () => {
    const deps = await buildExecuteRunbookDeps(
      fakeScript(() => 'unused', true),
      {
        ...managed,
        awsAccountDirectory: ['send/core/prod=000000000101'],
      },
    );
    assert.ok(deps.services.awsAccounts !== undefined);
  });

  it('keeps serving with a malformed directory: account runbooks fail with AWS_ACCOUNT_DIRECTORY_INVALID', async () => {
    const deps = await buildExecuteRunbookDeps(
      fakeScript(() => 'unused', true),
      {
        ...managed,
        awsAccountDirectory: ['send/core=000000000101'],
      },
    );
    assert.throws(
      () => deps.services.awsAccounts?.environment(),
      (error: unknown) => isAwsAccountError(error) && error.code === 'AWS_ACCOUNT_DIRECTORY_INVALID',
    );
  });

  it('reads through OAM in AWS-managed execution even when another binding is configured', async () => {
    const deps = await buildExecuteRunbookDeps(
      fakeScript(() => 'unused', true),
      {
        ...managed,
        awsAccountBinding: 'profiles',
        awsAccountDirectory: ['send/core/prod=000000000101'],
      },
    );
    assert.ok(deps.services.awsAccounts instanceof RuntimeAwsAccountsPort);
  });
});

function fakeScript(readSecretString: FakeSecretStringLoaderFn, isAWSManaged = false): GOScript {
  return {
    environment: { isAWSManaged },
    logger: { info: () => undefined, error: () => undefined } as unknown as GOLogger,
    aws: {
      clients: {
        profileNames: ['profile-a'],
        first: { getRegion: () => 'eu-south-1' },
        getClientProvider: () => ({ getRegion: () => 'eu-south-1' }),
      },
      services: {
        cloudWatchLogs: {} as AWSCloudWatchLogsService,
        cloudWatchMetrics: {} as AWSCloudWatchMetricsService,
        athena: {} as AWSAthenaService,
        dynamoDB: {} as AWSDynamoDBService,
        secretsManager: {
          async getSecretString(secretId: string): Promise<string> {
            const value = await Promise.resolve(readSecretString(secretId));
            return value;
          },
        },
      },
    },
  } as unknown as GOScript;
}

function servicePassword(watchtower: unknown): string {
  return (
    watchtower as {
      readonly auth: { readonly credentials: { readonly kind: 'SERVICE'; readonly password: string } };
    }
  ).auth.credentials.password;
}

function cliPatToken(watchtower: unknown): string {
  return (
    watchtower as {
      readonly auth: { readonly credentials: { readonly kind: 'CLI_PAT'; readonly token: string } };
    }
  ).auth.credentials.token;
}
