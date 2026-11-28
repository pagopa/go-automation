import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cidTrackerRows,
  executeAlarmWithLogs,
  isCidTrackerQuery,
} from '../../../shared/__tests__/helpers/runbookExecution.js';
import type { LogRows } from '../../../../../__tests__/helpers/LogRows.js';
import type { RunbookLogsExecution } from '../../../../../__tests__/helpers/RunbookLogsExecution.js';
import { INTEROP_API_V3_5XX_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';

function row(fields: Readonly<Record<string, string>>): LogRows[number] {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

async function run(scenario: {
  readonly environment?: string;
  readonly access?: LogRows;
  readonly application?: LogRows;
}): Promise<RunbookLogsExecution> {
  return executeAlarmWithLogs(
    buildRunbook(),
    `interop-api-v3-${scenario.environment ?? 'prod'}-apigw-5xx`,
    (query, groups) => {
      if (groups[0]?.startsWith('amazon-apigateway') === true) {
        return scenario.access ?? [row({ count: '1', status: '500', integrationError: '' })];
      }
      return isCidTrackerQuery(query) ? cidTrackerRows(query, []) : (scenario.application ?? []);
    },
  );
}

describe('INTEROP API v3 5xx known errors', () => {
  it('recognizes the documented gateway 504 timeout in prod only, never from an application log', async () => {
    const timeout = 'Execution failed due to a timeout error';
    const access = [
      row({ count: '1', status: '504', integrationError: timeout, httpMethod: 'GET', requestPath: '/v3/keyEvents' }),
    ];
    const prod = await run({ access });
    assert.match(prod.queries[0]?.query ?? '', /filter apigwId = "zafza38l7f"/u);
    assert.deepStrictEqual(prod.matchedIds, ['INTEROP_APIGW_IAV3A5_API-V3-BAC-TIM-504']);
    assert.deepStrictEqual((await run({ environment: 'test', access })).matchedIds, []);
    assert.deepStrictEqual((await run({ application: [row({ '@message': timeout })] })).matchedIds, []);
  });

  it('limits the documented multipart boundary error of the M2M gateway v3 to test', async () => {
    const application = [
      row({
        '@message': '[CID=multipart-cid] ERROR - Error in request: Multipart: Boundary not found',
        pod_app: alarm.serviceName,
      }),
    ];
    const test = await run({ environment: 'test', application });
    assert.match(test.queries[1]?.query ?? '', /filter pod_app like \/interop\\-be\\-m2m\\-gateway\\-v3\//u);
    assert.deepStrictEqual(test.matchedIds, ['INTEROP_APIGW_IAV3A5_API-V3-MUL-BOU-NOT-FOU']);
    assert.deepStrictEqual((await run({ environment: 'prod', application })).matchedIds, []);
  });

  it('leaves an unknown 5xx to the fallback', async () => {
    assert.deepStrictEqual((await run({})).matchedIds, []);
  });
});
