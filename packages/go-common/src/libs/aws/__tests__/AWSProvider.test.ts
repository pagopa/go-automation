import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GetQueryResultsCommand, ResultField, StartQueryCommand } from '@aws-sdk/client-cloudwatch-logs';

import type { AWSClientProvider } from '../AWSClientProvider.js';
import { AWSClientsProvider } from '../AWSClientsProvider.js';
import { AWSCloudWatchLogsService } from '../AWSCloudWatchLogsService.js';
import type { AWSMultiClientProvider } from '../AWSMultiClientProvider.js';
import { AWSProvider } from '../AWSProvider.js';
import { AWSServiceProvider } from '../AWSServiceProvider.js';

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

  it('caches the CloudWatch Logs service instance inside AWSServiceProvider', () => {
    const services = new AWSServiceProvider(asMultiProvider(new FakeAWSMultiClientProvider(['dev'])));

    assert.strictEqual(services.cloudWatchLogs, services.cloudWatchLogs);

    const beforeClose = services.cloudWatchLogs;
    services.close();

    assert.notStrictEqual(services.cloudWatchLogs, beforeClose);
  });
});
