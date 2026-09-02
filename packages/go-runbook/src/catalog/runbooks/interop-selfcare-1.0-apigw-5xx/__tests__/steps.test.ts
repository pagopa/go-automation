import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  AWSCloudWatchLogsQueryOptions,
  AWSCloudWatchLogsQueryResult,
  AWSCloudWatchLogsTimeRange,
  ResultField,
} from '@go-automation/go-common/aws';
import type { RunbookContext } from '../../../../types/RunbookContext.js';
import { interop } from '../../framework.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';

const PROFILE = interop.apigw.INTEROP_API_GW_5XX_SERVICE_ERRORS_PROFILE;

interface SeenQuery {
  readonly logGroups: ReadonlyArray<string>;
  readonly query: string;
  readonly timeRange: AWSCloudWatchLogsTimeRange;
  readonly options: AWSCloudWatchLogsQueryOptions;
}

function context(cloudWatchLogs: unknown, stepResults = new Map<string, unknown>()): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-08-24T09:10:11.000Z'),
    stepResults,
    vars: new Map([
      ['interopApiGwId', 'tf9isbi4pi'],
      ['interopApiGwLogGroup', 'amazon-apigateway-interop-access-logs-prod'],
    ]),
    params: new Map([
      ['startTime', '2026-08-24T09:05:11.000Z'],
      ['endTime', '2026-08-24T09:11:11.000Z'],
    ]),
    logs: [],
    services: createTestServiceRegistry({ cloudWatchLogs }),
    recoveredErrors: [],
  };
}

describe('INTEROP Selfcare API Gateway custom steps', () => {
  it('queries the runtime-resolved access log group and API Gateway id', async () => {
    let seen: SeenQuery | undefined;
    const rows: ReadonlyArray<ReadonlyArray<ResultField>> = [
      [
        { field: 'count', value: '3' },
        { field: 'status', value: '504' },
        { field: 'latestTimestamp', value: '2026-08-24 09:10:00.000' },
        { field: 'integrationError', value: 'Execution failed due to a timeout error' },
        { field: 'sourceIp', value: '203.0.113.10' },
      ],
    ];
    const cloudWatchLogs = {
      async queryWithStatistics(
        logGroups: ReadonlyArray<string>,
        query: string,
        timeRange: AWSCloudWatchLogsTimeRange,
        options: AWSCloudWatchLogsQueryOptions,
      ): Promise<AWSCloudWatchLogsQueryResult> {
        seen = { logGroups, query, timeRange, options };
        await Promise.resolve();
        return {
          rows,
          statistics: { bytesScanned: 10, recordsScanned: 4, recordsMatched: 3 },
          queryExecutions: [],
        };
      },
    };

    const step = new interop.apigw.QueryInteropApiGwAggregatesStep({
      id: 'query-api-gw-logs',
      label: 'Query',
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
      queryProfileId: PROFILE.apiGwQueryProfileId,
      queryKind: 'interop-api-gateway-5xx-aggregate',
      errorFamilyLabel: '5xx',
      buildQuery: PROFILE.buildApiGwAggregateQuery,
    });
    const result = await step.execute(context(cloudWatchLogs));

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output?.[0]?.find((field) => field.field === '@timestamp')?.value, rows[0]?.[2]?.value);
    assert.match(
      result.output?.[0]?.find((field) => field.field === 'message')?.value ?? '',
      /API Gateway 504 Execution failed due to a timeout error sourceIp=203\.0\.113\.10/u,
    );
    assert.deepStrictEqual(seen?.logGroups, ['amazon-apigateway-interop-access-logs-prod']);
    assert.match(seen?.query ?? '', /apigwId = "tf9isbi4pi"/u);
    assert.strictEqual(seen?.options.logGroupResolutionMode, 'search-configured-profiles');
    assert.strictEqual(seen?.timeRange.end.toISOString(), '2026-08-24T09:11:11.000Z');
  });

  it('sums aggregate counts and exposes the primary APIGW output variables', async () => {
    const rows: ReadonlyArray<ReadonlyArray<ResultField>> = [
      [
        { field: 'count', value: '3' },
        { field: 'status', value: '504' },
        { field: 'integrationStatus', value: '504' },
        { field: 'integrationError', value: 'Execution failed due to a timeout error' },
        { field: 'httpMethod', value: 'GET' },
        { field: 'requestPath', value: '/1.0/backend-for-frontend/tenants/id/users' },
        { field: 'sourceIp', value: '203.0.113.10' },
      ],
      [
        { field: 'count', value: '2' },
        { field: 'status', value: '500' },
      ],
    ];
    const step = new interop.apigw.AnalyzeInteropApiGwAggregatesStep({
      id: 'analyze',
      label: 'Analyze',
      fromStep: 'query',
      errorFamilyLabel: '5xx',
    });
    const result = await step.execute(context({}, new Map([['query', rows]])));

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output?.errorCount, 5);
    assert.deepStrictEqual(result.output?.statuses, ['500', '504']);
    assert.strictEqual(result.vars?.['apiGwErrorCount'], '5');
    assert.strictEqual(result.vars?.['apiGwErrorMessage'], 'Execution failed due to a timeout error');
    assert.strictEqual(result.vars?.['apiGwHttpMethod'], 'GET');
    assert.strictEqual(result.vars?.['apiGwSourceIp'], '203.0.113.10');
  });

  it('takes every representative APIGW variable from the aggregate row with the highest count', async () => {
    const rows: ReadonlyArray<ReadonlyArray<ResultField>> = [
      [
        { field: 'count', value: '1' },
        { field: 'status', value: '504' },
        { field: 'integrationStatus', value: '504' },
        { field: 'integrationError', value: 'minor error' },
        { field: 'httpMethod', value: 'GET' },
        { field: 'requestPath', value: '/a' },
        { field: 'sourceIp', value: '203.0.113.1' },
      ],
      [
        { field: 'count', value: '500' },
        { field: 'status', value: '500' },
        { field: 'integrationStatus', value: '502' },
        { field: 'integrationError', value: 'dominant error' },
        { field: 'httpMethod', value: 'POST' },
        { field: 'requestPath', value: '/b' },
        { field: 'sourceIp', value: '203.0.113.200' },
      ],
    ];
    const step = new interop.apigw.AnalyzeInteropApiGwAggregatesStep({
      id: 'analyze',
      label: 'Analyze',
      fromStep: 'query',
      errorFamilyLabel: '5xx',
    });
    const result = await step.execute(context({}, new Map([['query', rows]])));

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output?.errorCount, 501);
    assert.deepStrictEqual(result.output?.statuses, ['500', '504']);
    assert.deepStrictEqual(result.output?.sourceIps, ['203.0.113.1', '203.0.113.200']);
    assert.strictEqual(result.vars?.['apiGwStatusCode'], '500');
    assert.strictEqual(result.vars?.['apiGwIntegrationStatus'], '502');
    assert.strictEqual(result.vars?.['apiGwErrorMessage'], 'dominant error');
    assert.strictEqual(result.vars?.['apiGwHttpMethod'], 'POST');
    assert.strictEqual(result.vars?.['apiGwPath'], '/b');
    assert.strictEqual(result.vars?.['apiGwSourceIp'], '203.0.113.200');
  });
});
