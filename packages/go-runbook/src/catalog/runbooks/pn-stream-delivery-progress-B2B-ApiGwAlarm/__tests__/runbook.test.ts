import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GOLogger } from '@go-automation/go-common/core';
import type { ResultField } from '@go-automation/go-common/aws';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { ConditionEvaluator } from '../../../../core/ConditionEvaluator.js';
import type { RunbookContext } from '../../../../types/RunbookContext.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { buildRunbook } from '../runbook.js';
import { KNOWN_CASES } from '../knownCases.js';
import { API_GW_LOG_GROUP, AUTHORIZER_LOG_GROUP, ENTRY_SERVICE, VERSIONING_LOG_GROUP } from '../knownServices.js';

const ID = 'a2240f30-32dc-407d-80d9-4fd363aeaeb4';
const row = (fields: Record<string, string>): ResultField[] =>
  Object.entries(fields).map(([field, value]) => ({ field, value }));
const params = new Map([
  ['startTime', '2026-10-16T08:10:00Z'],
  ['endTime', '2026-10-16T08:20:00Z'],
]);

async function run(
  access: ResultField[][],
  execution: ResultField[][] = [],
  authorizer: ResultField[][] = [],
  versioning: ResultField[][] = [],
  unavailable = false,
): Promise<{ result: RunbookExecutionResult; calls: string[] }> {
  const calls: string[] = [];
  const services = createTestServiceRegistry({
    cloudWatchLogs: {
      query: async (groups: string[], query: string) => {
        await Promise.resolve();
        const group = groups[0] ?? '';
        calls.push(group);
        if (group === API_GW_LOG_GROUP) {
          const threshold = query.includes('status >= 500') ? 500 : 400;
          return access.filter((row) =>
            row.some(
              (field) =>
                ['status', 'authorizerStatus', 'integrationServiceStatus'].includes(field.field ?? '') &&
                Number(field.value) >= threshold,
            ),
          );
        }
        if (group === ENTRY_SERVICE.executionLogGroup) {
          if (unavailable) throw new Error('AccessDenied');
          return execution;
        }
        if (group === AUTHORIZER_LOG_GROUP) return authorizer;
        if (group === VERSIONING_LOG_GROUP) return versioning;
        return [];
      },
    },
  });
  const result = await new RunbookEngine(new GOLogger()).execute(buildRunbook(), params, services);
  return { result, calls };
}

describe('pn-stream delivery progress API Gateway runbook', () => {
  it('keeps a large volume of client errors out of the server-error correlation', async () => {
    const clients = Array.from({ length: 600 }, () => row({ status: '403', errorMessage: 'Forbidden' }));
    const { result, calls } = await run(
      [
        ...clients,
        row({
          status: '500',
          authorizerStatus: '500',
          authorizerRequestId: ID,
          errorMessage: '-',
          xrayTraceId: 'Root=1-test',
        }),
      ],
      [],
      [row({ '@requestId': ID, '@message': `REPORT RequestId: ${ID} Status: timeout` })],
    );
    assert.equal(result.matchedCases[0]?.id, 'stream-authorizer-runtime-timeout');
    assert.equal(calls.filter((g) => g === API_GW_LOG_GROUP).length, 1);
  });
  it('confirms the documented runtime timeout with correlated authorizer REPORT evidence', async () => {
    const { result, calls } = await run(
      [
        row({
          status: '500',
          authorizerStatus: '500',
          authorizerLatency: '10011',
          authorizerRequestId: ID,
          errorMessage: '-',
          xrayTraceId: 'Root=1-test',
        }),
      ],
      [],
      [row({ '@requestId': ID, '@message': `REPORT RequestId: ${ID}\tDuration: 10000.00 ms\tStatus: timeout` })],
    );
    assert.equal(result.matchedCases[0]?.id, 'stream-authorizer-runtime-timeout');
    assert.equal(result.resolvedAtStep, 'query-stream-authorizer-lambda');
    assert.deepEqual(calls, [API_GW_LOG_GROUP, AUTHORIZER_LOG_GROUP]);
    assert.equal(result.matchedCases[0]?.analysis?.proposedStatus, 'IN_PROGRESS');
  });

  it('recognises invocation 504 without calling it a Lambda runtime timeout', async () => {
    const { result } = await run(
      [
        row({
          status: '500',
          authorizerStatus: '500',
          authorizerLatency: '29000',
          requestId: ID,
          errorMessage: 'Internal server error',
          xrayTraceId: 'Root=1-test',
        }),
      ],
      [row({ '@message': `(${ID}) Lambda invocation failed with status: 504. Lambda request id: N/A` })],
    );
    assert.equal(result.matchedCases[0]?.id, 'stream-lambda-invocation-504');
    assert.ok(!result.matchedCases.some((c) => c.id === 'stream-authorizer-runtime-timeout'));
    assert.equal(result.matchedCases[0]?.analysis?.resolution, 'Risoluzione non documentata.');
  });

  it('does not infer runtime timeout, recovery or OOM from latency and empty logs', async () => {
    const { result } = await run([
      row({
        status: '500',
        authorizerStatus: '500',
        authorizerLatency: '29000',
        authorizerRequestId: '-',
        xrayTraceId: 'Root=1-test',
        errorMessage: '-',
      }),
    ]);
    assert.deepEqual(result.matchedCases, []);
  });

  it('continues beyond unavailable execution logs and checks versioning client errors', async () => {
    const { result, calls } = await run(
      [
        row({
          status: '403',
          authorizerStatus: '200',
          integrationRequestId: ID,
          path: '/delivery-progresses/v2.3/streams/test/events',
          requestId: ID,
          errorMessage: 'Forbidden',
          xrayTraceId: 'Root=1-test',
        }),
      ],
      [],
      [],
      [row({ '@requestId': ID, '@message': 'INFO PN_GENERIC_ERROR AxiosError: Request failed with status code 403' })],
      true,
    );
    assert.equal(result.matchedCases[0]?.id, 'stream-versioning-client-403');
    assert.ok(calls.includes(VERSIONING_LOG_GROUP));
  });

  it('keeps generic 500 and unrelated Lambda REPORT rows unresolved', async () => {
    const { result } = await run(
      [
        row({
          status: '500',
          authorizerStatus: '500',
          authorizerRequestId: ID,
          xrayTraceId: 'Root=1-test',
          errorMessage: '-',
        }),
      ],
      [],
      [row({ '@requestId': 'unrelated', '@message': 'REPORT RequestId: unrelated Status: timeout' })],
    );
    assert.deepEqual(result.matchedCases, []);
  });

  it('requires pn-stream inspection for endpoint timeout and does not invent a backend cause', async () => {
    const { result, calls } = await run([
      row({
        status: '504',
        authorizerStatus: '200',
        requestId: ID,
        xrayTraceId: 'Root=1-test',
        errorMessage: 'Endpoint request timed out',
      }),
    ]);
    assert.ok(calls.includes('/aws/ecs/pn-stream'));
    assert.equal(result.matchedCases[0]?.id, 'stream-endpoint-timeout');
    assert.equal(result.matchedCases[0]?.analysis?.proposedStatus, 'IN_PROGRESS');
  });

  it('matches each documented signature and keeps all resolution proposals open', () => {
    const fixtures: ReadonlyArray<readonly [string, string, unknown]> = [
      [
        'stream-waf-evaluation-error',
        'query-api-gw-logs',
        [row({ errorMessage: 'There was an error evaluating the AWS WAF rules associated with this API' })],
      ],
      [
        'stream-lambda-invocation-500',
        'query-api-gw-execution-logs',
        [row({ '@message': 'Lambda invocation failed with status: 500. Lambda request id: example' })],
      ],
      [
        'stream-authorizer-invocation-error',
        'query-api-gw-execution-logs',
        [row({ '@message': 'Gateway response type: AUTHORIZER_CONFIGURATION_ERROR with status code: 500' })],
      ],
    ];
    for (const [id, stepId, output] of fixtures) {
      const known = KNOWN_CASES.find((c) => c.id === id);
      assert.ok(known);
      const ctx: RunbookContext = {
        executionId: 'fixture',
        startedAt: new Date(),
        params,
        vars: new Map(),
        stepResults: new Map([[stepId, output]]),
        logs: [],
        recoveredErrors: [],
        services: createTestServiceRegistry(),
      };
      assert.equal(new ConditionEvaluator().evaluate(known.condition, ctx), true, id);
    }
    for (const known of KNOWN_CASES) {
      assert.equal(known.analysis?.proposedStatus, 'IN_PROGRESS');
      assert.deepEqual(known.analysis?.finalActions, []);
    }
  });
});
