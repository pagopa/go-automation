import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TestContext } from 'node:test';

import type { GetQueryResultsCommand, ResultField, StartQueryCommand } from '@aws-sdk/client-cloudwatch-logs';

import { AWSAthenaService } from '../AWSAthenaService.js';
import { AWSClientProvider } from '../AWSClientProvider.js';
import { AWSClientsProvider } from '../AWSClientsProvider.js';
import { AWSCloudWatchAlarmsService } from '../AWSCloudWatchAlarmsService.js';
import { AWSCloudWatchLogsService } from '../AWSCloudWatchLogsService.js';
import { AWSCloudWatchMetricsService } from '../AWSCloudWatchMetricsService.js';
import { AWSDynamoDBService } from '../AWSDynamoDBService.js';
import { AWSECSService } from '../AWSECSService.js';
import { AWSMultiClientProvider } from '../AWSMultiClientProvider.js';
import { AWSProvider } from '../AWSProvider.js';
import { AWSServiceProvider } from '../AWSServiceProvider.js';
import { AWSS3Service } from '../AWSS3Service.js';
import { AWSSQSService } from '../AWSSQSService.js';
import { isAWSTargetNotConfiguredError } from '../AWSTargetNotConfiguredError.js';

type CloudWatchLogsCommand = StartQueryCommand | GetQueryResultsCommand;
type CloudWatchLogsSendResponse =
  | { readonly queryId: string }
  | { readonly status: string; readonly results: ReadonlyArray<ReadonlyArray<ResultField>> };
type AWSClientOperationHandler<T> = (profile: string, clientProvider: AWSClientProvider) => Promise<T>;

interface FakeCloudWatchLogsClient {
  readonly profile: string;
  readonly commands: CloudWatchLogsCommand[];
  send(command: CloudWatchLogsCommand): Promise<CloudWatchLogsSendResponse>;
}

interface FakeAWSClientProvider {
  readonly profile: string;
  readonly s3: object;
  readonly dynamoDB: object;
  readonly cloudWatch: object;
  readonly cloudWatchLogs: FakeCloudWatchLogsClient;
  readonly athena: object;
  readonly sqs: object;
  readonly ecs: object;
  getProfile(): string;
}

class FakeAWSMultiClientProvider {
  private readonly providers: Map<string, FakeAWSClientProvider>;
  closeCalls = 0;

  constructor(profileNames: ReadonlyArray<string>) {
    this.providers = new Map(profileNames.map((profile) => [profile, createFakeClientProvider(profile)]));
  }

  get profileNames(): ReadonlyArray<string> {
    return [...this.providers.keys()];
  }

  get size(): number {
    return this.providers.size;
  }

  get hasMultipleProfiles(): boolean {
    return this.providers.size > 1;
  }

  get first(): AWSClientProvider {
    return this.getClientProvider(this.profileNames[0] ?? '');
  }

  getClientProvider(profile: string): AWSClientProvider {
    const provider = this.providers.get(profile);
    if (provider === undefined) {
      throw new Error(`Unknown profile: ${profile}`);
    }
    return provider as unknown as AWSClientProvider;
  }

  async mapParallel<T>(operation: AWSClientOperationHandler<T>): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    for (const profile of this.profileNames) {
      results.set(profile, await operation(profile, this.getClientProvider(profile)));
    }
    return results;
  }

  async mapParallelSettled<T>(operation: AWSClientOperationHandler<T>): Promise<{
    readonly results: Map<string, T>;
    readonly errors: Map<string, Error>;
  }> {
    const results = new Map<string, T>();
    const errors = new Map<string, Error>();
    for (const profile of this.profileNames) {
      try {
        results.set(profile, await operation(profile, this.getClientProvider(profile)));
      } catch (error) {
        errors.set(profile, error instanceof Error ? error : new Error(String(error)));
      }
    }
    return { results, errors };
  }

  close(): void {
    this.closeCalls += 1;
  }
}

function createFakeClientProvider(profile: string): FakeAWSClientProvider {
  return {
    profile,
    s3: { profile, kind: 's3' },
    dynamoDB: { profile, kind: 'dynamoDB' },
    cloudWatch: { profile, kind: 'cloudWatch' },
    cloudWatchLogs: createFakeCloudWatchLogsClient(profile),
    athena: { profile, kind: 'athena' },
    sqs: { profile, kind: 'sqs' },
    ecs: { profile, kind: 'ecs' },
    getProfile: () => profile,
  };
}

function createFakeCloudWatchLogsClient(profile: string): FakeCloudWatchLogsClient {
  return {
    profile,
    commands: [],
    async send(command) {
      this.commands.push(command);
      await Promise.resolve();
      if (command.constructor.name === 'StartQueryCommand') {
        return { queryId: `query-${profile}` };
      }
      return {
        status: 'Complete',
        results: [
          [
            { field: '@timestamp', value: `2026-05-14T10:00:00.000Z` },
            { field: 'profile', value: profile },
          ],
        ],
      };
    },
  };
}

function asMultiProvider(provider: FakeAWSMultiClientProvider): AWSMultiClientProvider {
  return provider as unknown as AWSMultiClientProvider;
}

describe('AWS unified provider facade', () => {
  it('caches concrete AWS clients and recreates them after close', () => {
    const provider = new AWSClientProvider({ profile: 'dev', region: 'eu-west-1' });

    const s3 = provider.s3;
    const dynamoDB = provider.dynamoDB;
    const cloudWatch = provider.cloudWatch;
    const cloudWatchLogs = provider.cloudWatchLogs;
    const athena = provider.athena;
    const sqs = provider.sqs;
    const ecs = provider.ecs;

    assert.strictEqual(provider.getProfile(), 'dev');
    assert.strictEqual(provider.getRegion(), 'eu-west-1');
    assert.strictEqual(provider.s3, s3);
    assert.strictEqual(provider.dynamoDB, dynamoDB);
    assert.strictEqual(provider.cloudWatch, cloudWatch);
    assert.strictEqual(provider.cloudWatchLogs, cloudWatchLogs);
    assert.strictEqual(provider.athena, athena);
    assert.strictEqual(provider.sqs, sqs);
    assert.strictEqual(provider.ecs, ecs);

    provider.close();

    assert.notStrictEqual(provider.s3, s3);
    assert.notStrictEqual(provider.dynamoDB, dynamoDB);
    assert.notStrictEqual(provider.cloudWatch, cloudWatch);
    assert.notStrictEqual(provider.cloudWatchLogs, cloudWatchLogs);
    assert.notStrictEqual(provider.athena, athena);
    assert.notStrictEqual(provider.sqs, sqs);
    assert.notStrictEqual(provider.ecs, ecs);

    provider.close();
  });

  it('deduplicates profiles and exposes cached concrete providers', () => {
    const multi = new AWSMultiClientProvider({ profiles: ['dev', 'prod', 'dev'], region: 'eu-west-1' });

    assert.deepStrictEqual(multi.profileNames, ['dev', 'prod']);
    assert.strictEqual(multi.size, 2);
    assert.strictEqual(multi.hasMultipleProfiles, true);
    assert.strictEqual(multi.first.getProfile(), 'dev');
    assert.strictEqual(multi.getClientProvider('prod'), multi.getClientProvider('prod'));
    assert.throws(() => multi.getClientProvider('test'), /Profile 'test' is not in the configured profiles/);

    const beforeClose = multi.getClientProvider('prod');
    multi.close();

    assert.notStrictEqual(multi.getClientProvider('prod'), beforeClose);
    multi.close();
  });

  it('uses the SDK default credential chain when no profile is configured', () => {
    const multi = new AWSMultiClientProvider({ profiles: [], region: 'eu-west-1' });

    assert.deepStrictEqual(multi.profileNames, ['default']);
    assert.strictEqual(multi.size, 1);
    assert.strictEqual(multi.hasMultipleProfiles, false);
    assert.strictEqual(multi.first.getProfile(), 'default');
  });

  it('maps operations across concrete multi-profile providers', async () => {
    const multi = new AWSMultiClientProvider({ profiles: ['dev', 'prod'] });

    const results = await multi.mapParallel(async (profile, clientProvider) => {
      await Promise.resolve();
      return `${profile}:${clientProvider.getProfile()}`;
    });

    assert.deepStrictEqual(
      [...results.entries()],
      [
        ['dev', 'dev:dev'],
        ['prod', 'prod:prod'],
      ],
    );
  });

  it('collects concrete multi-profile operation errors without throwing', async () => {
    const multi = new AWSMultiClientProvider({ profiles: ['dev', 'prod'] });

    const settled = await multi.mapParallelSettled(async (profile, clientProvider) => {
      await Promise.resolve();
      if (profile === 'prod') {
        throw new Error('prod failed');
      }
      return clientProvider.getProfile();
    });

    assert.deepStrictEqual([...settled.results.entries()], [['dev', 'dev']]);
    assert.deepStrictEqual(
      [...settled.errors.entries()].map(([profile, error]) => [profile, error.message]),
      [['prod', 'prod failed']],
    );
  });

  it('exposes first-profile client convenience getters and multi-profile helpers', async () => {
    const multi = new FakeAWSMultiClientProvider(['dev', 'prod']);
    const clients = new AWSClientsProvider(asMultiProvider(multi));

    assert.deepStrictEqual(clients.profileNames, ['dev', 'prod']);
    assert.strictEqual(clients.size, 2);
    assert.strictEqual(clients.hasMultipleProfiles, true);
    assert.strictEqual(clients.s3, clients.first.s3);
    assert.strictEqual(clients.dynamoDB, clients.first.dynamoDB);
    assert.strictEqual(clients.cloudWatch, clients.first.cloudWatch);
    assert.strictEqual(clients.cloudWatchLogs, clients.first.cloudWatchLogs);
    assert.strictEqual(clients.athena, clients.first.athena);
    assert.strictEqual(clients.sqs, clients.first.sqs);
    assert.strictEqual(clients.ecs, clients.first.ecs);
    assert.strictEqual(clients.get('prod'), clients.getClientProvider('prod'));

    const results = await clients.mapParallel(async (profile) => Promise.resolve(profile.toUpperCase()));
    assert.deepStrictEqual(
      [...results.entries()],
      [
        ['dev', 'DEV'],
        ['prod', 'PROD'],
      ],
    );
  });

  it('creates clients and services lazily from provider config', () => {
    const provider = new AWSProvider({ profiles: ['dev'] });
    const clients = provider.clients;
    const services = provider.services;

    assert.deepStrictEqual(clients.profileNames, ['dev']);
    assert.strictEqual(provider.clients, clients);
    assert.strictEqual(provider.services, services);
    assert.ok(services.cloudWatchLogs instanceof AWSCloudWatchLogsService);

    provider.close();

    assert.notStrictEqual(provider.clients, clients);
    assert.notStrictEqual(provider.services, services);
  });

  it('caches AWS service instances inside AWSServiceProvider', () => {
    const services = new AWSServiceProvider(asMultiProvider(new FakeAWSMultiClientProvider(['dev'])));

    assert.strictEqual(services.cloudWatchLogs, services.cloudWatchLogs);
    assert.strictEqual(services.cloudWatchAlarms, services.cloudWatchAlarms);
    assert.strictEqual(services.cloudWatchMetrics, services.cloudWatchMetrics);
    assert.strictEqual(services.dynamoDB, services.dynamoDB);
    assert.strictEqual(services.s3, services.s3);
    assert.strictEqual(services.sqs, services.sqs);
    assert.strictEqual(services.ecs, services.ecs);
    assert.strictEqual(services.athena, services.athena);
    assert.strictEqual(services.getAthena(), services.athena);

    assert.ok(services.cloudWatchLogs instanceof AWSCloudWatchLogsService);
    assert.ok(services.cloudWatchAlarms instanceof AWSCloudWatchAlarmsService);
    assert.ok(services.cloudWatchMetrics instanceof AWSCloudWatchMetricsService);
    assert.ok(services.dynamoDB instanceof AWSDynamoDBService);
    assert.ok(services.s3 instanceof AWSS3Service);
    assert.ok(services.sqs instanceof AWSSQSService);
    assert.ok(services.ecs instanceof AWSECSService);
    assert.ok(services.athena instanceof AWSAthenaService);

    const beforeClose = services.cloudWatchLogs;
    const beforeCloudWatchAlarms = services.cloudWatchAlarms;
    const beforeAthena = services.athena;
    services.close();

    assert.notStrictEqual(services.cloudWatchLogs, beforeClose);
    assert.notStrictEqual(services.cloudWatchAlarms, beforeCloudWatchAlarms);
    assert.notStrictEqual(services.athena, beforeAthena);
  });
});

const TARGET_REGION = 'eu-south-1';
const UAT_ACCOUNT = '222222222222';
const PROD_ACCOUNT = '111111111111';

/**
 * Replaces the one STS lookup every account selection goes through.
 *
 * The map is read on each call, so a test can let an expired session recover by
 * rewriting the entry between two attempts.
 *
 * @param t - The running test, which restores the stub when it ends
 * @param identities - Profile to account id, or to the error it fails with
 * @returns The profiles asked for an identity, in call order
 */
function stubIdentities(t: TestContext, identities: ReadonlyMap<string, string | Error>): { readonly calls: string[] } {
  const calls: string[] = [];
  t.mock.method(AWSClientProvider.prototype, 'resolveAccountId', async function (this: AWSClientProvider) {
    await Promise.resolve();
    const profile = this.getProfile();
    calls.push(profile);
    const outcome = identities.get(profile);
    if (outcome === undefined) throw new Error(`No scripted identity for '${profile}'`);
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });
  return { calls };
}

describe('AWSProvider — services bound to one execution target', () => {
  it('binds the services to the profile owning the account, not to the first configured one', async (t) => {
    stubIdentities(
      t,
      new Map([
        ['sso_prod', PROD_ACCOUNT],
        ['sso_uat', UAT_ACCOUNT],
      ]),
    );
    const provider = new AWSProvider({ profiles: ['sso_prod', 'sso_uat'], region: TARGET_REGION });

    const services = await provider.servicesFor({ accountId: UAT_ACCOUNT, region: TARGET_REGION });

    assert.deepStrictEqual(services.profileNames, ['sso_uat']);
    provider.close();
  });

  it('memoises the services per target, so concurrent occurrences share one identity lookup', async (t) => {
    const { calls } = stubIdentities(
      t,
      new Map([
        ['sso_prod', PROD_ACCOUNT],
        ['sso_uat', UAT_ACCOUNT],
      ]),
    );
    const provider = new AWSProvider({ profiles: ['sso_prod', 'sso_uat'], region: TARGET_REGION });
    const target = { accountId: UAT_ACCOUNT, region: TARGET_REGION };

    const [first, second] = await Promise.all([provider.servicesFor(target), provider.servicesFor(target)]);
    const third = await provider.servicesFor(target);

    assert.strictEqual(first, second, 'concurrent callers must share the pending resolution');
    assert.strictEqual(first, third, 'a settled resolution must be reused, keeping the log group cache warm');
    assert.deepStrictEqual([...calls].sort(), ['sso_prod', 'sso_uat'], 'each profile is asked once');
    provider.close();
  });

  it('gives two accounts independent services', async (t) => {
    stubIdentities(
      t,
      new Map([
        ['sso_prod', PROD_ACCOUNT],
        ['sso_uat', UAT_ACCOUNT],
      ]),
    );
    const provider = new AWSProvider({ profiles: ['sso_prod', 'sso_uat'], region: TARGET_REGION });

    const uat = await provider.servicesFor({ accountId: UAT_ACCOUNT, region: TARGET_REGION });
    const prod = await provider.servicesFor({ accountId: PROD_ACCOUNT, region: TARGET_REGION });

    assert.notStrictEqual(uat, prod);
    assert.deepStrictEqual(uat.profileNames, ['sso_uat']);
    assert.deepStrictEqual(prod.profileNames, ['sso_prod']);
    provider.close();
  });

  it('never caches a failed resolution, so refreshed credentials recover', async (t) => {
    const identities = new Map<string, string | Error>([['sso_uat', new Error('ExpiredToken')]]);
    stubIdentities(t, identities);
    const provider = new AWSProvider({ profiles: ['sso_uat'], region: TARGET_REGION });
    const target = { accountId: UAT_ACCOUNT, region: TARGET_REGION };

    await assert.rejects(async () => provider.servicesFor(target));
    identities.set('sso_uat', UAT_ACCOUNT);

    const services = await provider.servicesFor(target);
    assert.deepStrictEqual(services.profileNames, ['sso_uat']);
    provider.close();
  });

  it('keeps the run-wide services when every profile owns the account', async (t) => {
    stubIdentities(t, new Map([['sso_uat', UAT_ACCOUNT]]));
    const provider = new AWSProvider({ profiles: ['sso_uat'], region: TARGET_REGION });

    const services = await provider.servicesFor({ accountId: UAT_ACCOUNT, region: TARGET_REGION });

    assert.strictEqual(services, provider.services, 'nothing was narrowed, so there is nothing to rebuild');
    provider.close();
  });

  it('propagates the typed configuration error instead of serving the wrong account', async (t) => {
    stubIdentities(t, new Map([['sso_prod', PROD_ACCOUNT]]));
    const provider = new AWSProvider({ profiles: ['sso_prod'], region: TARGET_REGION });

    const error = await provider
      .servicesFor({ accountId: UAT_ACCOUNT, region: TARGET_REGION })
      .then(() => undefined)
      .catch((caught: unknown) => caught);

    assert.ok(isAWSTargetNotConfiguredError(error));
    assert.strictEqual(error.code, 'AWS_ACCOUNT_NOT_CONFIGURED');
    provider.close();
  });
});
