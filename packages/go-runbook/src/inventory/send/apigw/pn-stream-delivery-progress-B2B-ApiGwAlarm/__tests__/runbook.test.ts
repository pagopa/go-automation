import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { GOLogger } from '@pagopa/go-common/logging';
import { RunbookEngine, type RunbookExecutionResult } from '../../../../../engine/index.js';
import { createTestServiceRegistry } from '../../../../../toolkits/send/index.js';
import { buildRunbook } from '../runbook.js';
import { KNOWN_CASES } from '../knownCases.js';
import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';
import { caseMatches, knownCaseById } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import { API_GW_LOG_GROUP, AUTHORIZER_LOG_GROUP, ENTRY_SERVICE, VERSIONING_LOG_GROUP } from '../knownServices.js';

const ID = 'a2240f30-32dc-407d-80d9-4fd363aeaeb4';
const row = (fields: Record<string, string>): GOLogsInsightsResultField[] =>
  Object.entries(fields).map(([field, value]) => ({ field, value }));
const params = new Map([
  ['startTime', '2026-10-16T08:10:00Z'],
  ['endTime', '2026-10-16T08:20:00Z'],
]);

async function run(
  access: GOLogsInsightsResultField[][],
  execution: GOLogsInsightsResultField[][] = [],
  authorizer: GOLogsInsightsResultField[][] = [],
  versioning: GOLogsInsightsResultField[][] = [],
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
          xrayTraceId: 'Root=1-6ad1eae3-493a74b231f3e345492729e9',
        }),
      ],
      [],
      [row({ '@requestId': ID, '@message': `REPORT RequestId: ${ID} Status: timeout` })],
    );
    assert.equal(result.detections[0]?.knownCase.id, 'stream-authorizer-runtime-timeout');
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
          xrayTraceId: 'Root=1-6ad1eae3-493a74b231f3e345492729e9',
        }),
      ],
      [],
      [row({ '@requestId': ID, '@message': `REPORT RequestId: ${ID}\tDuration: 10000.00 ms\tStatus: timeout` })],
    );
    assert.deepEqual(
      result.detections.map(({ knownCase }) => knownCase.id),
      ['stream-authorizer-runtime-timeout'],
    );
    // A known case does not end the traversal: the service is still read, and finds nothing for this request.
    assert.deepEqual(calls, [API_GW_LOG_GROUP, AUTHORIZER_LOG_GROUP, ENTRY_SERVICE.logGroup]);
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
          xrayTraceId: 'Root=1-6ad1eae3-493a74b231f3e345492729e9',
        }),
      ],
      [row({ '@message': `(${ID}) Lambda invocation failed with status: 504. Lambda request id: N/A` })],
    );
    assert.equal(result.detections[0]?.knownCase.id, 'stream-lambda-invocation-504');
    assert.ok(!result.detections.some((c) => c.knownCase.id === 'stream-authorizer-runtime-timeout'));
  });

  it('does not infer runtime timeout, recovery or OOM from latency and empty logs', async () => {
    const { result } = await run([
      row({
        status: '500',
        authorizerStatus: '500',
        authorizerLatency: '29000',
        authorizerRequestId: '-',
        xrayTraceId: 'Root=1-6ad1eae3-493a74b231f3e345492729e9',
        errorMessage: '-',
      }),
    ]);
    assert.deepEqual(result.detections, []);
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
          xrayTraceId: 'Root=1-6ad1eae3-493a74b231f3e345492729e9',
        }),
      ],
      [],
      [],
      [row({ '@requestId': ID, '@message': 'INFO PN_GENERIC_ERROR AxiosError: Request failed with status code 403' })],
      true,
    );
    assert.equal(result.detections[0]?.knownCase.id, 'stream-versioning-client-403');
    assert.ok(calls.includes(VERSIONING_LOG_GROUP));
  });

  it('keeps generic 500 and unrelated Lambda REPORT rows unresolved', async () => {
    const { result } = await run(
      [
        row({
          status: '500',
          authorizerStatus: '500',
          authorizerRequestId: ID,
          xrayTraceId: 'Root=1-6ad1eae3-493a74b231f3e345492729e9',
          errorMessage: '-',
        }),
      ],
      [],
      [row({ '@requestId': 'unrelated', '@message': 'REPORT RequestId: unrelated Status: timeout' })],
    );
    assert.deepEqual(result.detections, []);
  });

  it('requires pn-stream inspection for endpoint timeout and does not invent a backend cause', async () => {
    const { result, calls } = await run([
      row({
        status: '504',
        authorizerStatus: '200',
        requestId: ID,
        xrayTraceId: 'Root=1-6ad1eae3-493a74b231f3e345492729e9',
        errorMessage: 'Endpoint request timed out',
      }),
    ]);
    assert.ok(calls.includes('/aws/ecs/pn-stream'));
    assert.equal(result.detections[0]?.knownCase.id, 'stream-endpoint-timeout');
  });

  it('matches each documented gateway signature', () => {
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
      assert.equal(
        caseMatches(knownCaseById(KNOWN_CASES, id), createTestContext({ stepResults: { [stepId]: output } })),
        true,
        id,
      );
    }
  });
});
