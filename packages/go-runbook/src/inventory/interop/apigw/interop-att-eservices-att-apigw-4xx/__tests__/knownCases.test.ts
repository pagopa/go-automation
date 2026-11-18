import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOLogger } from '@pagopa/go-common/logging';

import { executeRunbookForOccurrence } from '../../../../../runtime/index.js';
import { createTestServiceRegistry } from '../../../../../toolkits/interop/index.js';
import { executeAlarmWithLogs } from '../../../__tests__/helpers/runbookExecution.js';
import { fakeCloudWatchLogs } from '../../../../../__tests__/helpers/fakeCloudWatchLogs.js';
import type { LogRows } from '../../../../../__tests__/helpers/LogRows.js';
import { ALARM_NAME, API_GW_ID, API_GW_LOG_GROUP, QUERY_STEP_ID } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';

function row(overrides: Readonly<Record<string, string>> = {}): LogRows[number] {
  return Object.entries({
    apigwId: API_GW_ID,
    status: '403',
    httpMethod: 'GET',
    requestPath: '/',
    integrationStatus: '-',
    integrationError: '-',
    ...overrides,
  }).map(([field, value]) => ({ field, value }));
}

describe('Attestazione e-services API Gateway 4xx known case', () => {
  it('recognizes the observed 403 requests to the documented probe paths', async () => {
    const { matchedIds, queries } = await executeAlarmWithLogs(buildRunbook(), ALARM_NAME, () => [
      row(),
      row({ requestPath: '/favicon.ico' }),
    ]);
    assert.deepStrictEqual(matchedIds, ['att-eservices-documented-probe-paths-403']);
    assert.deepStrictEqual(
      queries.flatMap(({ groups }) => groups),
      [API_GW_LOG_GROUP],
    );
    assert.ok(queries[0]?.query.includes(`apigwId = "${API_GW_ID}"`));
    assert.ok(!queries[0]?.query.includes('sourceIp'));
  });

  it('does not classify empty, mixed, application, undocumented or 504 contexts', async () => {
    for (const rows of [
      [],
      [row({ requestPath: '/residence-verification/status' })],
      [row({ integrationStatus: '403' })],
      [row(), row({ status: '401', requestPath: '/residence-verification/check' })],
      [row({ requestPath: '/unknown-probe' })],
      [row({ status: '504', integrationStatus: '504', integrationError: 'Execution failed due to a timeout error' })],
    ]) {
      assert.deepStrictEqual((await executeAlarmWithLogs(buildRunbook(), ALARM_NAME, () => rows)).matchedIds, []);
    }
  });

  it('does not turn a query failure into empty evidence or a completed analysis', async () => {
    const { result } = await executeAlarmWithLogs(buildRunbook(), ALARM_NAME, () => {
      throw new Error('AccessDenied');
    });
    assert.strictEqual(result.status, 'failed');
    assert.deepStrictEqual(result.matchedCases, []);
  });

  it('exports the latest structured requests as bounded evidence for unexplained 4xx occurrences', async () => {
    const rows = [4, 0, 6, 1, 5, 2, 3].map((index) =>
      row({
        '@timestamp': `2026-10-29T04:37:0${String(index)}.000Z`,
        status: '404',
        requestPath: '/residence-verification/status',
        integrationStatus: '404',
        integrationError: `Unexpected response ${String(index)}`,
        requestId: `request-${String(index)}`,
      }),
    );
    const output = await executeRunbookForOccurrence(
      {
        logger: new GOLogger(),
        services: createTestServiceRegistry({ cloudWatchLogs: fakeCloudWatchLogs(() => rows) }),
      },
      {
        alarmName: ALARM_NAME,
        firedAt: '2026-10-29T04:41:26.000Z',
        awsAccountId: '123456789012',
        region: 'eu-west-1',
        awsProfiles: ['test-source'],
        executionMode: 'cloud',
      },
    );

    assert.strictEqual(output.outcome.kind, 'unknown-case');
    const evidence = output.context.evidence.find(({ id }) => id === 'att-eservices-access-requests');
    assert.ok(evidence);
    assert.strictEqual(evidence.type, 'step-output');
    assert.strictEqual(evidence.sourceStep, QUERY_STEP_ID);
    assert.strictEqual(evidence.truncated, true);
    assert.deepStrictEqual(
      evidence.items?.map((item) => item['requestId']),
      ['request-2', 'request-3', 'request-4', 'request-5', 'request-6'],
    );
    assert.deepStrictEqual(evidence.items?.[0], {
      apigwId: API_GW_ID,
      '@timestamp': '2026-10-29T04:37:02.000Z',
      status: '404',
      httpMethod: 'GET',
      requestPath: '/residence-verification/status',
      integrationStatus: '404',
      integrationError: 'Unexpected response 2',
      requestId: 'request-2',
    });
  });
});
