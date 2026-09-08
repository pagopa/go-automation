import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GetQueryResultsCommand,
  StartQueryCommand,
  StopQueryCommand,
  type ResultField,
} from '@aws-sdk/client-cloudwatch-logs';

import { AWSActiveOperationRegistry } from '../AWSActiveOperationRegistry.js';
import { AWSCloudWatchLogsService, isAWSCloudWatchLogsConfigurationError } from '../AWSCloudWatchLogsService.js';
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
  /** Fails StartQuery selectively, e.g. only for the log groups of one account. */
  readonly startErrorFor?: StartQueryErrorHook;
}

type GetQueryResultsHook = () => void;

/** Decides whether StartQuery fails for a given set of log group identifiers. */
type StartQueryErrorHook = (logGroupIdentifiers: ReadonlyArray<string>) => Error | undefined;

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
        const selective = options.startErrorFor?.(command.input.logGroupIdentifiers ?? []);
        if (selective !== undefined) {
          throw selective;
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

  it('falls back to an allowed account when the log group is not in the occurrence account', async () => {
    const notFound = Object.assign(new Error('log group does not exist'), { name: 'ResourceNotFoundException' });
    const provider = new FakeMultiProvider(
      new Map([
        [
          'monitoring',
          {
            startErrorFor: (identifiers) =>
              identifiers.some((identifier) => identifier.includes(':350578575906:')) ? notFound : undefined,
          },
        ],
      ]),
    );
    const service = createService(provider).forTarget({
      accountId: '350578575906',
      region: 'eu-south-1',
      fallbacks: [{ accountId: '510769970275' }],
    });

    const result = await service.queryWithStatistics(
      ['/aws/ecs/pn-external-registries'],
      'fields @timestamp',
      timeRange,
    );

    const starts = provider
      .client('monitoring')
      .commands.filter((command): command is StartQueryCommand => command instanceof StartQueryCommand);
    assert.deepStrictEqual(
      starts.map((start) => start.input.logGroupIdentifiers),
      [
        ['arn:aws:logs:eu-south-1:350578575906:log-group:/aws/ecs/pn-external-registries'],
        ['arn:aws:logs:eu-south-1:510769970275:log-group:/aws/ecs/pn-external-registries'],
      ],
    );
    // One monitoring identity throughout: OAM shares telemetry, not credentials.
    assert.deepStrictEqual(
      result.queryExecutions.map((execution) => execution.profile),
      ['monitoring'],
    );
  });

  it('reads a fallback with its own profile directly, without an OAM ARN', async () => {
    const notFound = Object.assign(new Error('log group does not exist'), { name: 'ResourceNotFoundException' });
    const provider = new FakeMultiProvider(
      new Map<string, FakeClientOptions>([
        [
          'confinfo',
          {
            startErrorFor: (identifiers) =>
              identifiers.some((identifier) => identifier.includes(':350578575906:')) ? notFound : undefined,
          },
        ],
        ['core', {}],
      ]),
    );
    const service = createService(provider).forTarget({
      accountId: '350578575906',
      region: 'eu-south-1',
      fallbacks: [{ accountId: '510769970275', profile: 'core' }],
    });

    const result = await service.queryWithStatistics(
      ['/aws/ecs/pn-external-registries'],
      'fields @timestamp',
      timeRange,
    );

    // Holding the account's credentials beats an OAM link: the group is read
    // by name, and the ARN form is never built for it.
    const coreStart = provider
      .client('core')
      .commands.find((command): command is StartQueryCommand => command instanceof StartQueryCommand);
    assert.deepStrictEqual(coreStart?.input.logGroupNames, ['/aws/ecs/pn-external-registries']);
    assert.strictEqual(coreStart?.input.logGroupIdentifiers, undefined);
    assert.deepStrictEqual(
      result.queryExecutions.map((execution) => execution.profile),
      ['core'],
    );
  });

  it('remembers the account that answered and tries it first next time', async () => {
    const notFound = Object.assign(new Error('log group does not exist'), { name: 'ResourceNotFoundException' });
    const provider = new FakeMultiProvider(
      new Map([
        [
          'monitoring',
          {
            startErrorFor: (identifiers) =>
              identifiers.some((identifier) => identifier.includes(':350578575906:')) ? notFound : undefined,
          },
        ],
      ]),
    );
    const service = createService(provider).forTarget({
      accountId: '350578575906',
      region: 'eu-south-1',
      fallbacks: [{ accountId: '510769970275' }],
    });

    await service.query(['/aws/ecs/pn-external-registries'], 'fields @timestamp', timeRange);
    await service.query(['/aws/ecs/pn-external-registries'], 'fields @timestamp', timeRange);

    const starts = provider
      .client('monitoring')
      .commands.filter((command): command is StartQueryCommand => command instanceof StartQueryCommand);
    // Three attempts, not four: the second query skips the account that failed.
    assert.strictEqual(starts.length, 3);
    assert.deepStrictEqual(starts[2]?.input.logGroupIdentifiers, [
      'arn:aws:logs:eu-south-1:510769970275:log-group:/aws/ecs/pn-external-registries',
    ]);
  });

  it('reports a configuration error when no allowed account owns the log group', async () => {
    const notFound = Object.assign(new Error('ResourceNotFoundException'), { name: 'ResourceNotFoundException' });
    const provider = new FakeMultiProvider(new Map([['monitoring', { startError: notFound }]]));
    const service = createService(provider).forTarget({
      accountId: '350578575906',
      region: 'eu-south-1',
      fallbacks: [{ accountId: '510769970275' }],
    });

    await assert.rejects(
      service.query(['/aws/ecs/absent'], 'fields @timestamp', timeRange),
      (error: unknown) =>
        isAWSCloudWatchLogsConfigurationError(error) &&
        error.code === 'LOG_GROUP_NOT_FOUND' &&
        error.message.includes('350578575906') &&
        error.message.includes('510769970275'),
    );
  });

  it('surfaces a non-recoverable failure instead of trying the next account', async () => {
    const throttled = Object.assign(new Error('Rate exceeded'), { name: 'ThrottlingException' });
    const provider = new FakeMultiProvider(new Map([['monitoring', { startError: throttled }]]));
    const service = createService(provider).forTarget({
      accountId: '350578575906',
      region: 'eu-south-1',
      fallbacks: [{ accountId: '510769970275' }],
    });

    await assert.rejects(service.query(['/aws/ecs/x'], 'fields @timestamp', timeRange), /Rate exceeded/);
    const starts = provider
      .client('monitoring')
      .commands.filter((command): command is StartQueryCommand => command instanceof StartQueryCommand);
    assert.strictEqual(starts.length, 1);
  });

  it('accepts an explicit ARN from a fallback account and rejects one outside the allowlist', async () => {
    const provider = new FakeMultiProvider(new Map([['monitoring', {}]]));
    const service = createService(provider).forTarget({
      accountId: '350578575906',
      region: 'eu-south-1',
      fallbacks: [{ accountId: '510769970275' }],
    });

    await service.query(
      ['arn:aws:logs:eu-south-1:510769970275:log-group:/aws/ecs/pn-external-registries'],
      'fields @timestamp',
      timeRange,
    );
    const start = provider
      .client('monitoring')
      .commands.find((command): command is StartQueryCommand => command instanceof StartQueryCommand);
    assert.deepStrictEqual(start?.input.logGroupIdentifiers, [
      'arn:aws:logs:eu-south-1:510769970275:log-group:/aws/ecs/pn-external-registries',
    ]);

    await assert.rejects(
      service.query(['arn:aws:logs:eu-south-1:999999999999:log-group:/x'], 'fields @timestamp', timeRange),
      (error: unknown) => isAWSCloudWatchLogsConfigurationError(error) && error.code === 'INVALID_OAM_TARGET',
    );
  });

  it('refuses fallback accounts declared without a target account', () => {
    const provider = new FakeMultiProvider(new Map([['monitoring', {}]]));
    assert.throws(
      () => createService(provider).forTarget({ region: 'eu-south-1', fallbacks: [{ accountId: '510769970275' }] }),
      (error: unknown) => isAWSCloudWatchLogsConfigurationError(error) && error.code === 'INVALID_OAM_TARGET',
    );
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
