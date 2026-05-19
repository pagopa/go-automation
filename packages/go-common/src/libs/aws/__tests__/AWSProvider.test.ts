import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GetQueryResultsCommand, ResultField, StartQueryCommand } from '@aws-sdk/client-cloudwatch-logs';

import { AWSAthenaService } from '../AWSAthenaService.js';
import { AWSClientProvider } from '../AWSClientProvider.js';
import { AWSClientsProvider } from '../AWSClientsProvider.js';
import { AWSCloudWatchLogsService } from '../AWSCloudWatchLogsService.js';
import { AWSCloudWatchMetricsService } from '../AWSCloudWatchMetricsService.js';
import { AWSDynamoDBService } from '../AWSDynamoDBService.js';
import { AWSECSService } from '../AWSECSService.js';
import { AWSMultiClientProvider } from '../AWSMultiClientProvider.js';
import { AWSProvider } from '../AWSProvider.js';
import { AWSServiceProvider } from '../AWSServiceProvider.js';
import { AWSS3Service } from '../AWSS3Service.js';
import { AWSSQSService } from '../AWSSQSService.js';

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

  it('rejects empty multi-profile configuration', () => {
    assert.throws(() => new AWSMultiClientProvider({ profiles: [] }), /At least one AWS profile must be provided/);
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
    assert.strictEqual(services.cloudWatchMetrics, services.cloudWatchMetrics);
    assert.strictEqual(services.dynamoDB, services.dynamoDB);
    assert.strictEqual(services.s3, services.s3);
    assert.strictEqual(services.sqs, services.sqs);
    assert.strictEqual(services.ecs, services.ecs);
    assert.strictEqual(services.athena, services.athena);
    assert.strictEqual(services.getAthena(), services.athena);

    assert.ok(services.cloudWatchLogs instanceof AWSCloudWatchLogsService);
    assert.ok(services.cloudWatchMetrics instanceof AWSCloudWatchMetricsService);
    assert.ok(services.dynamoDB instanceof AWSDynamoDBService);
    assert.ok(services.s3 instanceof AWSS3Service);
    assert.ok(services.sqs instanceof AWSSQSService);
    assert.ok(services.ecs instanceof AWSECSService);
    assert.ok(services.athena instanceof AWSAthenaService);

    const beforeClose = services.cloudWatchLogs;
    const beforeAthena = services.athena;
    services.close();

    assert.notStrictEqual(services.cloudWatchLogs, beforeClose);
    assert.notStrictEqual(services.athena, beforeAthena);
  });
});
