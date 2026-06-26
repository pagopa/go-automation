import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GetQueryResultsCommand,
  StartQueryCommand,
  StopQueryCommand,
  type ResultField,
} from '@aws-sdk/client-cloudwatch-logs';

import { AWSActiveOperationRegistry } from '../AWSActiveOperationRegistry.js';
import { AWSCloudWatchLogsService } from '../AWSCloudWatchLogsService.js';
import type { AWSCloudWatchLogsQueryStatistics } from '../AWSCloudWatchLogsService.js';
import type { AWSClientProvider } from '../AWSClientProvider.js';
import type { AWSMultiClientProvider } from '../AWSMultiClientProvider.js';

type CloudWatchLogsCommand = StartQueryCommand | GetQueryResultsCommand | StopQueryCommand;
type CloudWatchLogsSendResponse =
  | Record<string, never>
  | { readonly queryId: string }
  | {
      readonly status: string;
      readonly results: ReadonlyArray<ReadonlyArray<ResultField>>;
      readonly statistics?: Partial<AWSCloudWatchLogsQueryStatistics>;
      readonly nextToken?: string;
    };

interface FakeCloudWatchLogsClient {
  readonly profile: string;
  readonly commands: CloudWatchLogsCommand[];
  send(command: CloudWatchLogsCommand): Promise<CloudWatchLogsSendResponse>;
}

interface FakeAWSClientProvider {
  readonly cloudWatchLogs: FakeCloudWatchLogsClient;
  getProfile(): string;
  getRegion(): string;
}

interface FakeClientOptions {
  readonly startError?: Error;
  readonly timestamp?: string;
  readonly statistics?: Partial<AWSCloudWatchLogsQueryStatistics>;
  readonly resultPages?: ReadonlyArray<{
    readonly results: ReadonlyArray<ReadonlyArray<ResultField>>;
    readonly statistics?: Partial<AWSCloudWatchLogsQueryStatistics>;
  }>;
  readonly onGetQueryResults?: GetQueryResultsHook;
  readonly queryStatus?: string;
}

type GetQueryResultsHook = () => void;

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
    getRegion: () => 'eu-south-1',
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

      if (command instanceof StopQueryCommand) {
        return {};
      }

      options.onGetQueryResults?.();

      const input = command.input as { readonly nextToken?: string };
      if (options.resultPages !== undefined) {
        const pageIndex = input.nextToken === undefined ? 0 : Number(input.nextToken.replace('page-', ''));
        const page = options.resultPages[pageIndex];
        if (page === undefined) {
          throw new Error(`Unexpected nextToken: ${input.nextToken ?? '<first>'}`);
        }
        return {
          status: 'Complete',
          results: page.results,
          ...(page.statistics !== undefined ? { statistics: page.statistics } : {}),
          ...(pageIndex < options.resultPages.length - 1 ? { nextToken: `page-${pageIndex + 1}` } : {}),
        };
      }

      return {
        status: options.queryStatus ?? 'Complete',
        results: [
          [
            { field: '@timestamp', value: options.timestamp ?? '2026-05-14T10:00:00.000Z' },
            { field: 'profile', value: profile },
          ],
        ],
        ...(options.statistics !== undefined ? { statistics: options.statistics } : {}),
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
  it('uses OAM logGroupIdentifiers for an execution-scoped source account', async () => {
    const provider = new FakeMultiProvider(new Map([['default', {}]]));
    const service = createService(provider).forTarget({ accountId: '123456789012', region: 'eu-south-1' });

    await service.query(['/aws/lambda/source'], 'fields @timestamp', timeRange);

    const start = provider
      .client('default')
      .commands.find((command): command is StartQueryCommand => command instanceof StartQueryCommand);
    assert.deepStrictEqual(start?.input.logGroupIdentifiers, [
      'arn:aws:logs:eu-south-1:123456789012:log-group:/aws/lambda/source',
    ]);
    assert.strictEqual(start?.input.logGroupNames, undefined);
  });

  it('stops a remote Logs query once when the execution is aborted', async () => {
    const controller = new AbortController();
    const provider = new FakeMultiProvider(
      new Map([
        [
          'default',
          {
            queryStatus: 'Running',
            onGetQueryResults: () => controller.abort(),
          },
        ],
      ]),
    );
    const service = createService(provider);

    await assert.rejects(
      service.query(['/aws/lambda/source'], 'fields @timestamp', timeRange, {
        signal: controller.signal,
        maxPollAttempts: 2,
      }),
    );

    assert.strictEqual(
      provider.client('default').commands.filter((command) => command instanceof StopQueryCommand).length,
      1,
    );
  });

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

  it('keeps configured profile search available when scoped to an execution', async () => {
    const provider = new FakeMultiProvider(
      new Map([
        ['first', { startError: new Error('ResourceNotFoundException: log group not found') }],
        ['second', {}],
      ]),
    );
    const service = createService(provider).forExecution(new AWSActiveOperationRegistry());

    const rows = await service.query(['/aws/ecs/service'], 'fields @timestamp, @message', timeRange, {
      logGroupResolutionMode: 'search-configured-profiles',
    });

    assert.strictEqual(profileValue(rows[0] ?? []), 'second');
    assert.strictEqual(provider.client('first').commands.length, 1);
    assert.strictEqual(provider.client('second').commands.length, 2);
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

  it('returns aggregate query statistics when requested', async () => {
    const provider = new FakeMultiProvider(
      new Map([['first', { statistics: { bytesScanned: 100, recordsScanned: 10, recordsMatched: 2 } }]]),
    );
    const service = createService(provider);

    const result = await service.queryWithStatistics(['/aws/ecs/a', '/aws/ecs/b'], 'fields @timestamp', timeRange, {
      logGroupResolutionMode: 'search-configured-profiles',
    });

    assert.strictEqual(result.rows.length, 2);
    assert.deepStrictEqual(result.statistics, {
      bytesScanned: 200,
      recordsScanned: 20,
      recordsMatched: 4,
    });
    assert.strictEqual(result.queryExecutions.length, 2);
    assert.deepStrictEqual(
      result.queryExecutions.map((execution) => execution.queryId),
      ['query-first', 'query-first'],
    );
  });

  it('does not paginate GetQueryResults by default', async () => {
    const provider = new FakeMultiProvider(
      new Map([
        [
          'first',
          {
            resultPages: [
              {
                results: [[{ field: 'message', value: 'first-page' }]],
                statistics: { bytesScanned: 100, recordsScanned: 10, recordsMatched: 2 },
              },
              {
                results: [[{ field: 'message', value: 'second-page' }]],
                statistics: { bytesScanned: 100, recordsScanned: 10, recordsMatched: 2 },
              },
            ],
          },
        ],
      ]),
    );
    const service = createService(provider);

    const result = await service.queryWithStatistics(['/aws/ecs/a'], 'fields @timestamp', timeRange);
    const getQueryCommands = provider
      .client('first')
      .commands.filter((command): command is GetQueryResultsCommand => command instanceof GetQueryResultsCommand);

    assert.strictEqual(result.rows.length, 1);
    assert.strictEqual(result.rows[0]?.find((field) => field.field === 'message')?.value, 'first-page');
    assert.strictEqual(getQueryCommands.length, 1);
    assert.strictEqual(getQueryCommands[0]?.input.maxItems, undefined);
  });

  it('paginates GetQueryResults when requested', async () => {
    const provider = new FakeMultiProvider(
      new Map([
        [
          'first',
          {
            resultPages: [
              {
                results: [[{ field: 'message', value: 'first-page' }]],
                statistics: { bytesScanned: 100, recordsScanned: 10, recordsMatched: 2 },
              },
              {
                results: [[{ field: 'message', value: 'second-page' }]],
                statistics: { bytesScanned: 100, recordsScanned: 10, recordsMatched: 2 },
              },
            ],
          },
        ],
      ]),
    );
    const service = createService(provider);

    const result = await service.queryWithStatistics(['/aws/ecs/a'], 'fields @timestamp', timeRange, {
      paginateResults: true,
    });
    const getQueryCommands = provider
      .client('first')
      .commands.filter((command): command is GetQueryResultsCommand => command instanceof GetQueryResultsCommand);

    assert.strictEqual(result.rows.length, 2);
    assert.deepStrictEqual(
      result.rows.map((row) => row.find((field) => field.field === 'message')?.value),
      ['first-page', 'second-page'],
    );
    assert.strictEqual(getQueryCommands.length, 2);
    assert.strictEqual(getQueryCommands[0]?.input.maxItems, 10_000);
    assert.strictEqual(getQueryCommands[1]?.input.nextToken, 'page-1');
    assert.strictEqual(getQueryCommands[1]?.input.maxItems, 10_000);
  });
});
