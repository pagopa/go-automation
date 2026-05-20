import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ResultField } from '@go-automation/go-common/aws';
import type { Runbook } from '../../../types/Runbook.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { RunbookExecutionResult } from '../../../types/RunbookExecutionResult.js';
import type { RunbookExecutionTrace } from '../../../trace/RunbookExecutionTrace.js';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';
import type { ApiGwOutputContext } from '../ApiGwOutputContext.js';
import { buildApiGwOutputContext } from '../buildApiGwOutputContext.js';

function row(fields: Record<string, string>): ResultField[] {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

function createRunbook(withContext: boolean = true): Runbook {
  return {
    metadata: {
      id: 'api-gw-runbook',
      name: 'API GW Runbook',
      description: 'desc',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: [],
    },
    steps: [],
    knownCases: [],
    fallbackAction: { type: 'log', level: 'warn', message: 'fallback' },
    ...(withContext
      ? {
          runbookContext: {
            kind: 'apigw',
            apiGwLogGroup: 'access-log-group',
            queryProfileId: 'send',
            services: [{ name: 'pn-delivery', varPrefix: 'delivery', logGroup: '/aws/ecs/pn-delivery' }],
          },
        }
      : {}),
  };
}

function createResult(): RunbookExecutionResult {
  const vars = new Map<string, string>([
    ['apiGwErrorCount', '3'],
    ['apiGwStatusCode', '500'],
    ['apiGwHttpMethod', 'POST'],
    ['apiGwPath', '/delivery/check'],
    ['xRayTraceId', '1-abc'],
    ['apiGwErrorMessage', 'Internal server error'],
    ['apiGwAuthorizerLambdaName', 'pn-ioAuthorizerLambda'],
    ['apiGwAuthorizerStatus', '500'],
    ['apiGwAuthorizerLatencyMs', '5011'],
    ['apiGwAuthorizerRequestId', 'auth-req'],
    ['apiGwAuthorizerTimeoutMs', '5000'],
    ['apiGwAuthorizerOutcome', 'timeout'],
    ['apiGwExecutionLogMode', 'queried'],
    ['apiGwExecutionLogGroup', 'execution-log-group'],
    ['apiGwExecutionLogRequestCount', '2'],
    ['apiGwExecutionLogRequestIds', 'req-1,req-2'],
    ['apiGwExecutionLogPaths', '/a,/b'],
    ['apiGwExecutionLogCount', '10'],
    ['deliveryLogCount', '3'],
    ['deliveryErrorMsg', 'service failed'],
    ['deliveryNextUrl', 'http://internal/service'],
    ['deliveryNextUrlTarget', 'pn-next'],
    ['lastErrorMsg', 'service failed'],
    ['apiGwServicesVisited', 'pn-delivery|3'],
  ]);
  const stepResults = new Map<string, unknown>([
    [
      'query-api-gw-logs',
      [
        row({ '@timestamp': '2026-01-01T00:00:01.000Z', '@message': 'old api gw' }),
        row({ '@timestamp': '2026-01-01T00:00:03.000Z', '@message': 'new api gw' }),
      ],
    ],
    [
      'query-pn-delivery',
      [
        row({ '@timestamp': '2026-01-01T00:00:01.000Z', '@message': 'old service' }),
        row({ '@timestamp': '2026-01-01T00:00:02.000Z', message: 'fallback message field' }),
        row({ '@timestamp': '2026-01-01T00:00:03.000Z', '@message': 'new service' }),
      ],
    ],
  ]);
  const finalContext: RunbookContext = {
    executionId: 'exec-1',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults,
    vars,
    params: new Map<string, string>([
      ['alarmName', 'alarm'],
      ['alarmDatetime', '2026-01-01T00:00:00.000Z'],
      ['startTime', '2025-12-31T23:55:00.000Z'],
      ['endTime', '2026-01-01T00:05:00.000Z'],
    ]),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
  const trace: RunbookExecutionTrace = {
    schemaVersion: '1.0.0',
    execution: {
      executionId: 'exec-1',
      runbookId: 'api-gw-runbook',
      runbookName: 'API GW Runbook',
      runbookVersion: '1.0.0',
      runbookType: 'alarm-resolution',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:05.000Z',
      durationMs: 5000,
      status: 'completed',
      environment: { awsProfiles: [], region: 'eu-south-1', invokedBy: 'manual' },
    },
    input: {},
    pipeline: [],
    variables: Object.fromEntries(vars),
    caseMatching: { casesEvaluated: 0, evaluations: [], matchedCaseIds: [] },
    actionsExecuted: [],
    summary: {
      description: 'completed',
      totalSteps: 0,
      stepsExecuted: 0,
      stepsFailed: 0,
      stepsRecovered: 0,
      stepsSkipped: 0,
      outcome: 'no-match',
    },
  };
  return {
    runbookId: 'api-gw-runbook',
    status: 'completed',
    matchedCases: [],
    durationMs: 5000,
    stepsExecuted: 0,
    finalContext,
    recoveredErrors: [],
    trace,
  };
}

describe('buildApiGwOutputContext', () => {
  it('returns undefined when the runbook has no API Gateway context', () => {
    assert.strictEqual(buildApiGwOutputContext(createRunbook(false), createResult()), undefined);
  });

  it('builds fields, evidence and typed details from vars and step results', () => {
    const context = buildApiGwOutputContext(createRunbook(), createResult(), { maxRecentLogs: 2 });

    assert.ok(context !== undefined);
    assert.strictEqual(context.fields.find((field) => field.name === 'endpoint')?.value, 'POST /delivery/check');
    assert.strictEqual(context.fields.find((field) => field.name === 'authorizerLatency')?.value, '5011 ms');
    assert.strictEqual(
      context.evidence.find((evidence) => evidence.id === 'pn-delivery-recent-errors')?.truncated,
      true,
    );

    const details = context.details as unknown as ApiGwOutputContext;
    assert.strictEqual(details.apiGateway.traceId, '1-abc');
    assert.strictEqual(details.authorizer?.lambdaName, 'pn-ioAuthorizerLambda');
    assert.strictEqual(details.authorizer?.latencyMs, 5011);
    assert.strictEqual(details.authorizer?.outcome, 'timeout');
    assert.strictEqual(details.executionLogs?.requestIds[1]?.requestId, 'req-2');
    assert.strictEqual(details.executionLogs?.requestIds[1]?.path, '/b');
    assert.strictEqual(details.services[0]?.recentLogs.length, 2);
    assert.strictEqual(details.services[0]?.recentLogs[0]?.message, 'fallback message field');
    assert.strictEqual(details.services[0]?.recentLogs[1]?.message, 'new service');
  });
});
