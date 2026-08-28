import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  AWSCloudWatchLogsQueryOptions,
  AWSCloudWatchLogsQueryResult,
  AWSCloudWatchLogsTimeRange,
  ResultField,
} from '@go-automation/go-common/aws';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import { QueryInteropApiGwAggregatesStep } from '../steps/QueryInteropApiGwAggregatesStep.js';

describe('QueryInteropApiGwAggregatesStep', () => {
  it('queries the resolved group and enriches aggregate rows as output evidence', async () => {
    let seenRange: AWSCloudWatchLogsTimeRange | undefined;
    const rows: ReadonlyArray<ReadonlyArray<ResultField>> = [
      [
        { field: 'latestTimestamp', value: '2026-08-24 09:59:00.000' },
        { field: 'count', value: '2' },
        { field: 'status', value: '403' },
        { field: 'sourceIp', value: '203.0.113.4' },
      ],
      [
        { field: 'latestTimestamp', value: '2026-08-24 09:58:00.000' },
        { field: 'count', value: '1' },
        { field: 'status', value: '403' },
        { field: 'httpMethod', value: 'GET' },
        { field: 'requestPath', value: '/token.oauth2' },
        { field: 'integrationError', value: ' - ' },
        { field: 'sourceIp', value: '-' },
      ],
    ];
    const cloudWatchLogs = {
      async queryWithStatistics(
        logGroups: ReadonlyArray<string>,
        query: string,
        timeRange: AWSCloudWatchLogsTimeRange,
        _options: AWSCloudWatchLogsQueryOptions,
      ): Promise<AWSCloudWatchLogsQueryResult> {
        assert.deepStrictEqual(logGroups, ['access-logs']);
        assert.strictEqual(query, 'query api-id');
        seenRange = timeRange;
        await Promise.resolve();
        return {
          rows,
          statistics: { bytesScanned: 1, recordsScanned: 2, recordsMatched: 2 },
          queryExecutions: [],
        };
      },
    };
    const context: RunbookContext = {
      executionId: 'test',
      startedAt: new Date('2026-08-24T10:00:00.000Z'),
      stepResults: new Map(),
      vars: new Map([
        ['interopApiGwId', 'api-id'],
        ['interopApiGwLogGroup', 'access-logs'],
      ]),
      params: new Map([
        ['startTime', '2026-08-24T09:58:00.000Z'],
        ['endTime', '2026-08-24T10:01:00.000Z'],
      ]),
      logs: [],
      services: { cloudWatchLogs } as unknown as ServiceRegistry,
      recoveredErrors: [],
    };
    const step = new QueryInteropApiGwAggregatesStep({
      id: 'query',
      label: 'Query',
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
      queryProfileId: 'profile',
      queryKind: 'kind',
      errorFamilyLabel: '4xx',
      buildQuery: (apiGwId) => `query ${apiGwId}`,
    });

    const result = await step.execute(context);
    assert.strictEqual(result.success, true);
    assert.strictEqual(seenRange?.end.toISOString(), '2026-08-24T10:01:00.000Z');
    assert.match(result.output?.[0]?.find(({ field }) => field === 'message')?.value ?? '', /API Gateway 403/u);
    assert.strictEqual(result.output?.[0]?.find(({ field }) => field === '@timestamp')?.value, rows[0]?.[0]?.value);
    assert.strictEqual(
      result.output?.[1]?.find(({ field }) => field === 'message')?.value,
      'API Gateway 403 GET /token.oauth2',
    );
  });

  it('snapshots its configuration instead of retaining the caller object', () => {
    const timeRangeFromParams = { start: 'startTime', end: 'endTime' };
    const config = {
      id: 'query',
      label: 'Query',
      timeRangeFromParams,
      queryProfileId: 'profile',
      queryKind: 'kind',
      errorFamilyLabel: '4xx',
      buildQuery: (apiGwId: string) => `original ${apiGwId}`,
      apiGwIdVar: 'apiGwId',
      logGroupVar: 'logGroup',
    };
    const step = new QueryInteropApiGwAggregatesStep(config);

    config.queryProfileId = 'mutated-profile';
    config.queryKind = 'mutated-kind';
    config.buildQuery = (apiGwId: string) => `mutated ${apiGwId}`;
    config.apiGwIdVar = 'mutatedApiGwId';
    config.logGroupVar = 'mutatedLogGroup';
    timeRangeFromParams.start = 'mutatedStartTime';

    const trace = step.getTraceInfo({
      executionId: 'test',
      startedAt: new Date('2026-08-24T10:00:00.000Z'),
      stepResults: new Map(),
      vars: new Map([
        ['apiGwId', 'api-id'],
        ['logGroup', 'access-logs'],
      ]),
      params: new Map([
        ['startTime', '2026-08-24T09:58:00.000Z'],
        ['endTime', '2026-08-24T10:01:00.000Z'],
      ]),
      logs: [],
      services: {} as ServiceRegistry,
      recoveredErrors: [],
    });

    assert.strictEqual(trace['queryProfileId'], 'profile');
    assert.strictEqual(trace['queryKind'], 'kind');
    assert.strictEqual(trace['query'], 'original api-id');
    assert.deepStrictEqual(trace['logGroups'], ['access-logs']);
    assert.deepStrictEqual(trace['timeRange'], {
      start: '2026-08-24T09:58:00.000Z',
      end: '2026-08-24T10:01:00.000Z',
    });
  });
});
