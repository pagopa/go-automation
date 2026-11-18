import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookExecutionResult } from '../../../../../../engine/types/RunbookExecutionResult.js';
import type { ApiGwOutputContext } from '../ApiGwOutputContext.js';
import { buildApiGwOutputContext } from '../buildApiGwOutputContext.js';
import { createTestExecutionResult } from '../../../../../../__tests__/helpers/createTestExecutionResult.js';
import { createTestRunbook } from '../../../../../../__tests__/helpers/createTestRunbook.js';
import { logRow } from '../../../../../../__tests__/helpers/logRow.js';

const RUNBOOK = createTestRunbook({
  runbookContext: {
    kind: 'apigw',
    product: 'SEND',
    apiGwLogGroup: 'access-log-group',
    queryProfileId: 'send',
    services: [{ name: 'pn-delivery', varPrefix: 'delivery', logGroup: '/aws/ecs/pn-delivery' }],
  },
});

const VARS: Readonly<Record<string, string>> = {
  apiGwErrorCount: '3',
  apiGwStatusCode: '500',
  apiGwHttpMethod: 'POST',
  apiGwPath: '/delivery/check',
  apiGwSourceIp: '203.0.113.42',
  xRayTraceId: '1-abc',
  apiGwErrorMessage: 'Internal server error',
  apiGwAuthorizerLambdaName: 'pn-ioAuthorizerLambda',
  apiGwAuthorizerStatus: '500',
  apiGwAuthorizerLatencyMs: '5011',
  apiGwAuthorizerRequestId: 'auth-req',
  apiGwAuthorizerTimeoutMs: '5000',
  apiGwAuthorizerOutcome: 'timeout',
  apiGwExecutionLogMode: 'queried',
  apiGwExecutionLogGroup: 'execution-log-group',
  apiGwExecutionLogRequestCount: '2',
  apiGwExecutionLogRequestIds: 'req-1,req-2',
  apiGwExecutionLogPaths: '/a,/b',
  apiGwExecutionLogCount: '10',
  deliveryLogCount: '3',
  deliveryErrorMsg: 'service failed',
  deliveryNextUrl: 'http://internal/service',
  deliveryNextUrlTarget: 'pn-next',
  lastErrorMsg: 'service failed',
  apiGwServicesVisited: 'pn-delivery|3',
};

/** A finished API Gateway execution, with `vars` replacing the default variables. */
function createResult(vars: Readonly<Record<string, string>> = {}): RunbookExecutionResult {
  return createTestExecutionResult({
    vars: { ...VARS, ...vars },
    params: {
      alarmName: 'alarm',
      alarmDatetime: '2026-01-01T00:00:00.000Z',
      startTime: '2025-12-31T23:55:00.000Z',
      endTime: '2026-01-01T00:05:00.000Z',
    },
    stepResults: {
      'query-api-gw-logs': [
        logRow({ '@timestamp': '2026-01-01T00:00:01.000Z', '@message': 'old api gw' }),
        logRow({ '@timestamp': '2026-01-01T00:00:03.000Z', '@message': 'new api gw' }),
      ],
      'query-pn-delivery': [
        logRow({ '@timestamp': '2026-01-01T00:00:01.000Z', '@message': 'old service' }),
        logRow({ '@timestamp': '2026-01-01T00:00:02.000Z', message: 'fallback message field' }),
        logRow({ '@timestamp': '2026-01-01T00:00:03.000Z', '@message': 'new service' }),
      ],
    },
  });
}

describe('buildApiGwOutputContext', () => {
  it('returns undefined when the runbook has no API Gateway context', () => {
    assert.strictEqual(buildApiGwOutputContext(createTestRunbook(), createResult()), undefined);
  });

  it('builds fields, evidence and typed details from vars and step results', () => {
    const context = buildApiGwOutputContext(RUNBOOK, createResult(), { maxRecentLogs: 2 });

    assert.ok(context !== undefined);
    assert.strictEqual(context.fields.find((field) => field.name === 'endpoint')?.value, 'POST /delivery/check');
    assert.strictEqual(context.fields.find((field) => field.name === 'apiGwSourceIp')?.value, '203.0.113.42');
    assert.strictEqual(context.fields.find((field) => field.name === 'authorizerLatency')?.value, '5011 ms');
    assert.strictEqual(
      context.evidence.find((evidence) => evidence.id === 'pn-delivery-recent-errors')?.truncated,
      true,
    );

    const details = context.details as unknown as ApiGwOutputContext;
    assert.strictEqual(details.apiGateway.traceId, '1-abc');
    assert.strictEqual(details.apiGateway.sourceIp, '203.0.113.42');
    assert.strictEqual(details.authorizer?.lambdaName, 'pn-ioAuthorizerLambda');
    assert.strictEqual(details.authorizer?.latencyMs, 5011);
    assert.strictEqual(details.authorizer?.outcome, 'timeout');
    assert.strictEqual(details.executionLogs?.requestIds[1]?.requestId, 'req-2');
    assert.strictEqual(details.executionLogs?.requestIds[1]?.path, '/b');
    assert.strictEqual(details.services[0]?.recentLogs.length, 2);
    assert.strictEqual(details.services[0]?.recentLogs[0]?.message, 'fallback message field');
    assert.strictEqual(details.services[0]?.recentLogs[1]?.message, 'new service');
  });

  it('exposes why execution logs are unavailable in fields and typed details', () => {
    const reason = 'MalformedQueryException: time range exceeds the log retention settings';
    const context = buildApiGwOutputContext(
      RUNBOOK,
      createResult({
        apiGwExecutionLogMode: 'unavailable',
        apiGwExecutionLogCount: '0',
        apiGwExecutionLogUnavailableReason: reason,
      }),
    );

    assert.strictEqual(context?.fields.find((field) => field.name === 'executionLogUnavailableReason')?.value, reason);
    const details = context?.details as unknown as ApiGwOutputContext;
    assert.strictEqual(details.executionLogs?.unavailableReason, reason);
  });

  it('includes a successful authorizer gate outcome when exposed by vars', () => {
    const context = buildApiGwOutputContext(
      RUNBOOK,
      createResult({ apiGwAuthorizerOutcome: 'no-error', apiGwAuthorizerStatus: '200' }),
    );

    const details = context?.details as unknown as ApiGwOutputContext;
    assert.strictEqual(details.authorizer?.outcome, 'no-error');
    assert.strictEqual(details.authorizer?.status, '200');
  });
});
