import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { GOLogsInsightsResultField, AWSCloudWatchLogsQueryResult } from '@pagopa/go-aws/cloudwatch-logs/insights';

import { readCloudWatchLogsBatches } from '../readCloudWatchLogsBatches.js';
import { tryCloudWatchLogsRead } from '../tryCloudWatchLogsRead.js';
import type { CloudWatchLogsBatchedReadResult } from '../CloudWatchLogsBatchedReadResult.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';
import type { OperationalContext } from '../../../../services/OperationalContext.js';

type Rows = ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;
type QueryAnswerFn = (query: string) => Rows;

const RANGE = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-01-01T00:10:00Z') };

function contextAnswering(answer: QueryAnswerFn, signal?: AbortSignal): OperationalContext {
  return createTestContext({
    ...(signal === undefined ? {} : { signal }),
    services: {
      cloudWatchLogs: {
        query: async (_groups: ReadonlyArray<string>, query: string) => {
          await Promise.resolve();
          return answer(query);
        },
      },
    },
  });
}

function configurationError(): Error {
  return Object.assign(new Error('the target region does not match'), { code: 'OAM_REGION_MISMATCH' });
}

async function readIds(
  context: OperationalContext,
  ids: ReadonlyArray<string>,
): Promise<CloudWatchLogsBatchedReadResult> {
  return readCloudWatchLogsBatches(context, {
    logGroups: ['/aws/lambda/pn-x'],
    timeRange: RANGE,
    options: {},
    items: ids,
    batchSize: 2,
    query: (batch) => `filter id in [${batch.join(',')}] | limit 2`,
    identifier: (id) => ({ kind: 'requestId', value: id }),
  });
}

describe('readCloudWatchLogsBatches', () => {
  it('keeps the batches that answered and declares a failed batch unavailable for its identifiers', async () => {
    const context = contextAnswering((query) => {
      if (query.includes('c')) throw new Error('ThrottlingException');
      return [[{ field: '@message', value: query }]];
    });
    const read = await readIds(context, ['a', 'b', 'c']);
    assert.strictEqual(read.rows.length, 1);
    assert.deepStrictEqual(
      read.failures.map((failure) => failure.message),
      ['ThrottlingException'],
    );
    assert.deepStrictEqual(read.coverage, [
      {
        source: '/aws/lambda/pn-x',
        complete: false,
        reason: 'unavailable',
        detail: 'ThrottlingException',
        identifiers: [{ kind: 'requestId', value: 'c' }],
      },
    ]);
  });

  it('names the identifiers of a saturated batch', async () => {
    const row = [{ field: '@message', value: 'line' }];
    const statistics = { bytesScanned: 1, recordsScanned: 2, recordsMatched: 2 };
    const context = createTestContext({
      services: {
        cloudWatchLogs: {
          queryWithStatistics: async (groups: ReadonlyArray<string>) => {
            await Promise.resolve();
            return {
              rows: [row, row],
              statistics,
              queryExecutions: [
                { queryId: 'q', profile: 'local', logGroups: [...groups], statistics, rowsReturned: 2 },
              ],
            };
          },
        },
      },
    });
    const read = await readIds(context, ['a']);
    assert.deepStrictEqual(
      read.coverage.map(({ reason, identifiers }) => [reason, identifiers]),
      [['saturated', [{ kind: 'requestId', value: 'a' }]]],
    );
  });

  it('throws the error of the first failure when no batch answered', async () => {
    let calls = 0;
    const context = contextAnswering(() => {
      calls += 1;
      throw new Error(`failure ${String(calls)}`);
    });
    await assert.rejects(readIds(context, ['a', 'b', 'c']), /failure 1/);
    assert.strictEqual(calls, 2);
  });

  it('stops at once on a configuration error of the target', async () => {
    let calls = 0;
    const context = contextAnswering(() => {
      calls += 1;
      throw configurationError();
    });
    await assert.rejects(readIds(context, ['a', 'b', 'c']), /region does not match/);
    assert.strictEqual(calls, 1);
  });

  it('stops at once when the execution is cancelled', async () => {
    const controller = new AbortController();
    const context = contextAnswering(() => {
      controller.abort();
      throw new Error('query aborted');
    }, controller.signal);
    await assert.rejects(readIds(context, ['a', 'b', 'c']), /query aborted/);
  });
});

describe('tryCloudWatchLogsRead', () => {
  const read = { logGroups: ['/aws/ecs/pn-a'], query: 'fields @message', timeRange: RANGE, options: {} };

  it('returns the rows of a read that answered', async () => {
    const attempt = await tryCloudWatchLogsRead(
      contextAnswering(() => [[{ field: '@message', value: 'ok' }]]),
      read,
    );
    assert.strictEqual(attempt.failure, undefined);
    assert.strictEqual(attempt.rows.length, 1);
    assert.deepStrictEqual(attempt.coverage, []);
  });

  it('turns a failed read into an unavailable entry labelled with its source', async () => {
    const attempt = await tryCloudWatchLogsRead(
      contextAnswering(() => {
        throw new Error('AccessDeniedException');
      }),
      { ...read, source: 'send/core' },
    );
    assert.strictEqual(attempt.failure?.message, 'AccessDeniedException');
    assert.deepStrictEqual(attempt.rows, []);
    assert.deepStrictEqual(attempt.coverage, [
      { source: 'send/core', complete: false, reason: 'unavailable', detail: 'AccessDeniedException' },
    ]);
  });

  it('throws a configuration error of the target and a cancellation', async () => {
    await assert.rejects(
      tryCloudWatchLogsRead(
        contextAnswering(() => {
          throw configurationError();
        }),
        read,
      ),
      /region does not match/,
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      tryCloudWatchLogsRead(
        contextAnswering(() => {
          throw new Error('query aborted');
        }, controller.signal),
        read,
      ),
      /query aborted/,
    );
  });

  it('passes the abort signal of the context to the read', async () => {
    const controller = new AbortController();
    let received: unknown;
    const context = createTestContext({
      signal: controller.signal,
      services: {
        cloudWatchLogs: {
          query: async (_groups: ReadonlyArray<string>, _query: string, _range: unknown, options: unknown) => {
            await Promise.resolve();
            received = (options as { readonly signal?: AbortSignal }).signal;
            return [];
          },
        },
      },
    });
    await tryCloudWatchLogsRead(context, read);
    assert.strictEqual(received, controller.signal);
  });
  it('divides a saturated batch and hands its final rows to rowsOf once, one result per item', async () => {
    const queries: string[] = [];
    const statistics = { bytesScanned: 1, recordsScanned: 4, recordsMatched: 4 };
    const queryWithStatistics = async (
      groups: ReadonlyArray<string>,
      query: string,
    ): Promise<AWSCloudWatchLogsQueryResult> => {
      await Promise.resolve();
      queries.push(query);
      const rows = ['a', 'b']
        .filter((id) => query.includes(id))
        .flatMap((id) =>
          [1, 2].map((index) => [
            { field: '@ptr', value: `${id}${String(index)}` },
            { field: 'id', value: id },
          ]),
        );
      return { rows, statistics, queryExecutions: [{ queryId: 'q', profile: 'p', logGroups: groups, statistics }] };
    };
    const context = {
      ...createTestContext({
        services: { cloudWatchLogs: { query: async () => Promise.resolve([]), queryWithStatistics } },
      }),
      readSplits: { remaining: 10 },
    };
    const results: string[] = [];

    const read = await readCloudWatchLogsBatches(context, {
      logGroups: ['/aws/lambda/pn-x'],
      timeRange: RANGE,
      options: {},
      items: ['a', 'b'],
      query: (batch) => `filter id in [${batch.join(',')}] | limit 3`,
      identifier: (id) => ({ kind: 'requestId', value: id }),
      rowsOf: (rows, batch) => {
        results.push(...batch.map((id) => `${id}:${String(rows.filter((row) => row[1]?.value === id).length)}`));
        return rows;
      },
      belongs: (row, id) => row[1]?.value === id,
      rowIdentity: (row) => row[0]?.value ?? '',
    });

    assert.strictEqual(queries.length, 3);
    assert.strictEqual(read.rows.length, 4);
    assert.deepStrictEqual(results, ['a:2', 'b:2']);
    assert.ok(read.coverage.every((entry) => entry.complete));
  });

  it('counts every failed read of the execution, whatever the caller makes of it', async () => {
    const context = {
      ...contextAnswering(() => {
        throw new Error('MalformedQueryException');
      }),
      readFailures: new Map<string, number>(),
    };

    await assert.rejects(readIds(context, ['a', 'b', 'c']), /MalformedQueryException/);
    await tryCloudWatchLogsRead(context, {
      logGroups: ['/aws/lambda/pn-x'],
      query: 'q',
      timeRange: RANGE,
      options: {},
    });

    assert.strictEqual(context.readFailures.get('cloudWatchLogs'), 3);
  });
});
