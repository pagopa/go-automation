import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type {
  AWSCloudWatchLogsQueryExecution,
  AWSCloudWatchLogsQueryOptions,
  AWSCloudWatchLogsQueryResult,
} from '@pagopa/go-aws/cloudwatch-logs/insights';

import { queryCoverage, queryRowLimit } from '../queryCoverage.js';
import { executeCloudWatchLogsQuery } from '../executeCloudWatchLogsQuery.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';

const STATISTICS = { bytesScanned: 1, recordsScanned: 1, recordsMatched: 1 };
const RANGE = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-01-01T00:10:00Z') };

function execution(overrides: Partial<AWSCloudWatchLogsQueryExecution> = {}): AWSCloudWatchLogsQueryExecution {
  return { queryId: 'q', profile: 'local', logGroups: ['/aws/ecs/pn-a'], statistics: STATISTICS, ...overrides };
}

describe('queryCoverage', () => {
  it('reads the last limit of the query, or the Logs Insights default', () => {
    assert.strictEqual(queryRowLimit('fields @message | limit 50 | sort @timestamp | limit 200'), 200);
    assert.strictEqual(queryRowLimit('fields @message'), 10_000);
  });

  it('declares saturated a query at its limit or with unread pages, and unavailable a failed page or read', () => {
    const coverage = queryCoverage(
      'fields @message | limit 2',
      [
        execution({ rowsReturned: 1 }),
        execution({ rowsReturned: 2 }),
        execution({ rowsReturned: 1, unreadPages: 'budget' }),
        execution({
          rowsReturned: 1,
          unreadPages: 'failed',
          logGroups: ['arn:aws:logs:eu-south-1:000000000000:log-group:/aws/ecs/pn-b'],
        }),
      ],
      [{ logGroups: ['/aws/ecs/pn-c'], error: new Error('AccessDeniedException') }],
    );

    assert.deepStrictEqual(
      coverage.map(({ source, reason }) => ({ source, reason })),
      [
        { source: '/aws/ecs/pn-a', reason: 'saturated' },
        { source: '/aws/ecs/pn-a', reason: 'saturated' },
        { source: '/aws/ecs/pn-b', reason: 'unavailable' },
        { source: '/aws/ecs/pn-c', reason: 'unavailable' },
      ],
    );
    assert.strictEqual(coverage[3]?.detail, 'AccessDeniedException');
  });
});

describe('executeCloudWatchLogsQuery', () => {
  async function run(result: AWSCloudWatchLogsQueryResult): ReturnType<typeof executeCloudWatchLogsQuery> {
    const context = createTestContext({
      services: {
        cloudWatchLogs: {
          // eslint-disable-next-line @typescript-eslint/require-await
          async queryWithStatistics() {
            return result;
          },
        },
      },
    });
    return await executeCloudWatchLogsQuery(context, ['/aws/ecs/pn-a', '/aws/ecs/pn-c'], 'fields @message', RANGE, {});
  }

  it('keeps the rows of the reads that answered and declares the failed ones', async () => {
    const executed = await run({
      rows: [[{ field: '@message', value: 'boom' }]],
      statistics: STATISTICS,
      queryExecutions: [execution({ rowsReturned: 1 })],
      failedReads: [{ logGroups: ['/aws/ecs/pn-c'], error: new Error('ResourceNotFoundException') }],
    });

    assert.strictEqual(executed.rows.length, 1);
    assert.deepStrictEqual(
      executed.coverage.map(({ source, reason }) => ({ source, reason })),
      [{ source: '/aws/ecs/pn-c', reason: 'unavailable' }],
    );
  });

  it('asks for partial results only under the partial read policy', async () => {
    const seen: (boolean | undefined)[] = [];
    for (const readPolicy of ['partial', 'strict'] as const) {
      const context = {
        ...createTestContext({
          services: {
            cloudWatchLogs: {
              // eslint-disable-next-line @typescript-eslint/require-await
              async queryWithStatistics(
                _groups: ReadonlyArray<string>,
                _query: string,
                _range: unknown,
                options?: AWSCloudWatchLogsQueryOptions,
              ) {
                seen.push(options?.partialResults);
                return { rows: [], statistics: STATISTICS, queryExecutions: [execution({ rowsReturned: 0 })] };
              },
            },
          },
        }),
        readPolicy,
      };
      await executeCloudWatchLogsQuery(context, ['/aws/ecs/pn-a'], 'fields @message', RANGE, {});
    }
    assert.deepStrictEqual(seen, [true, false]);
  });

  it('fails as a whole when no read answered', async () => {
    await assert.rejects(
      run({
        rows: [],
        statistics: STATISTICS,
        queryExecutions: [],
        failedReads: [{ logGroups: ['/aws/ecs/pn-a'], error: new Error('ThrottlingException') }],
      }),
      /ThrottlingException/u,
    );
  });
});
