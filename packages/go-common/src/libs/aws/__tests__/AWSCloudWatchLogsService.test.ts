import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GetQueryResultsCommand, StartQueryCommand, type ResultField } from '@aws-sdk/client-cloudwatch-logs';

import { AWSCloudWatchLogsService } from '../AWSCloudWatchLogsService.js';
import type { AWSClientProvider } from '../AWSClientProvider.js';
import type { AWSMultiClientProvider } from '../AWSMultiClientProvider.js';

type CloudWatchLogsCommand = StartQueryCommand | GetQueryResultsCommand;
type CloudWatchLogsSendResponse =
  | { readonly queryId: string }
  | { readonly status: string; readonly results: ReadonlyArray<ReadonlyArray<ResultField>> };

interface FakeCloudWatchLogsClient {
  readonly profile: string;
  readonly commands: CloudWatchLogsCommand[];
  send(command: CloudWatchLogsCommand): Promise<CloudWatchLogsSendResponse>;
}

interface FakeAWSClientProvider {
  readonly cloudWatchLogs: FakeCloudWatchLogsClient;
  getProfile(): string;
}

interface FakeClientOptions {
  readonly startError?: Error;
  readonly timestamp?: string;
}

class FakeMultiProvider {
  private readonly providers: Map<string, FakeAWSClientProvider>;

  constructor(profileOptions: ReadonlyMap<string, FakeClientOptions>) {
    this.providers = new Map(
      [...profileOptions.entries()].map(([profile, options]) => [profile, createFakeProvider(profile, options)]),
    );
  }

  get profileNames(): ReadonlyArray<string> {
    return [...this.providers.keys()];
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

  client(profile: string): FakeCloudWatchLogsClient {
    return this.providers.get(profile)?.cloudWatchLogs ?? raiseUnknownProfile(profile);
  }
}

function createFakeProvider(profile: string, options: FakeClientOptions): FakeAWSClientProvider {
  return {
    cloudWatchLogs: createFakeCloudWatchLogsClient(profile, options),
    getProfile: () => profile,
  };
}

function createFakeCloudWatchLogsClient(profile: string, options: FakeClientOptions): FakeCloudWatchLogsClient {
  return {
    profile,
    commands: [],
    async send(command) {
      this.commands.push(command);
      await Promise.resolve();

      if (command instanceof StartQueryCommand) {
        if (options.startError !== undefined) {
          throw options.startError;
        }
        return { queryId: `query-${profile}` };
      }

      return {
        status: 'Complete',
        results: [
          [
            { field: '@timestamp', value: options.timestamp ?? '2026-05-14T10:00:00.000Z' },
            { field: 'profile', value: profile },
          ],
        ],
      };
    },
  };
}

function raiseUnknownProfile(profile: string): never {
  throw new Error(`Unknown profile: ${profile}`);
}

function asMultiProvider(provider: FakeMultiProvider): AWSMultiClientProvider {
  return provider as unknown as AWSMultiClientProvider;
}

function createService(provider: FakeMultiProvider): AWSCloudWatchLogsService {
  return new AWSCloudWatchLogsService(asMultiProvider(provider));
}

function profileValue(row: ReadonlyArray<ResultField>): string | undefined {
  return row.find((field) => field.field === 'profile')?.value;
}

const timeRange = {
  start: new Date('2026-05-14T09:00:00.000Z'),
  end: new Date('2026-05-14T11:00:00.000Z'),
};

describe('AWSCloudWatchLogsService', () => {
  it('uses the first profile by default', async () => {
    const provider = new FakeMultiProvider(
      new Map([
        ['first', {}],
        ['second', {}],
      ]),
    );
    const service = createService(provider);

    const rows = await service.query(['/aws/ecs/service'], 'fields @timestamp, @message', timeRange);

    assert.strictEqual(profileValue(rows[0] ?? []), 'first');
    assert.strictEqual(provider.client('first').commands.length, 2);
    assert.strictEqual(provider.client('second').commands.length, 0);
  });

  it('searches configured profiles for a log group and caches the successful profile', async () => {
    const provider = new FakeMultiProvider(
      new Map([
        ['first', { startError: new Error('ResourceNotFoundException: log group not found') }],
        ['second', {}],
      ]),
    );
    const service = createService(provider);

    const firstRows = await service.query(['/aws/ecs/service'], 'fields @timestamp, @message', timeRange, {
      logGroupResolutionMode: 'search-configured-profiles',
    });

    assert.strictEqual(profileValue(firstRows[0] ?? []), 'second');
    assert.strictEqual(provider.client('first').commands.length, 1);
    assert.strictEqual(provider.client('second').commands.length, 2);

    await service.query(['/aws/ecs/service'], 'fields @timestamp, @message', timeRange, {
      logGroupResolutionMode: 'search-configured-profiles',
    });

    assert.strictEqual(provider.client('first').commands.length, 1);
    assert.strictEqual(provider.client('second').commands.length, 4);
  });

  it('queries each log group when searching configured profiles', async () => {
    const provider = new FakeMultiProvider(new Map([['first', { timestamp: '2026-05-14T10:00:00.000Z' }]]));
    const service = createService(provider);

    const rows = await service.query(['/aws/ecs/a', '/aws/ecs/b'], 'fields @timestamp, @message', timeRange, {
      logGroupResolutionMode: 'search-configured-profiles',
    });

    assert.strictEqual(rows.length, 2);
    assert.ok(rows.every((row) => profileValue(row) === 'first'));
  });
});
