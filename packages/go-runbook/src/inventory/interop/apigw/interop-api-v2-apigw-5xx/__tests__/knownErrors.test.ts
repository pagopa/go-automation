import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cidTrackerRows,
  executeAlarmWithLogs,
  isCidTrackerQuery,
} from '../../../shared/__tests__/helpers/runbookExecution.js';
import type { LogRows } from '../../../../../__tests__/helpers/LogRows.js';
import type { RunbookLogsExecution } from '../../../../../__tests__/helpers/RunbookLogsExecution.js';
import { INTEROP_API_V2_5XX_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';

function row(fields: Readonly<Record<string, string>>): LogRows[number] {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

async function run(scenario: {
  readonly environment?: string;
  readonly access?: LogRows;
  readonly application?: LogRows;
  readonly tracker?: LogRows;
}): Promise<RunbookLogsExecution> {
  return executeAlarmWithLogs(
    buildRunbook(),
    `interop-api-v2-${scenario.environment ?? 'prod'}-apigw-5xx`,
    (query, groups) => {
      if (groups[0]?.startsWith('amazon-apigateway') === true) {
        return scenario.access ?? [row({ count: '1', status: '500', integrationError: '' })];
      }
      return isCidTrackerQuery(query) ? cidTrackerRows(query, scenario.tracker ?? []) : (scenario.application ?? []);
    },
  );
}

describe('INTEROP API v2 5xx known errors', () => {
  it('finds the documented WARN that produces HTTP 500 only in test', async () => {
    const application = [
      row({
        '@message':
          '[CID=client-kind-cid] WARN errors: 012-0021, Unexpected client kind "API" for client id. ' +
          'forceGenericProblemOn500 is set to true, returning generic problem',
        pod_app: alarm.serviceName,
      }),
    ];
    const test = await run({ environment: 'test', application });
    // The application query adds the WARN marker to the error scan.
    assert.match(test.queries[1]?.query ?? '', /@message like \/Unexpected client kind\//u);
    assert.deepStrictEqual(test.matchedIds, ['INTEROP_APIGW_IAV2A5_API-V2-UNE-API-CLI-KIN']);
    assert.deepStrictEqual((await run({ environment: 'prod', application })).matchedIds, []);
  });

  it('recognizes a gateway 504 timeout but never infers it from an application log', async () => {
    const timeout = 'Execution failed due to a timeout error';
    const gateway = await run({
      access: [row({ count: '1', status: '504', integrationError: timeout, requestPath: '/v2/keyEvents' })],
    });
    assert.deepStrictEqual(gateway.matchedIds, ['INTEROP_APIGW_IAV2A5_API-V2-BAC-TIM-504']);
    assert.deepStrictEqual((await run({ application: [row({ '@message': timeout })] })).matchedIds, []);
  });

  it('traces a duplicate event through the CID of the failed request', async () => {
    const { matchedIds, queries } = await run({
      application: [row({ '@message': '[CID=purpose-cid] ERROR creating purpose', pod_app: alarm.serviceName })],
      tracker: [
        row({
          '@message':
            'errors: 006-9991, Error creating event: duplicate key value violates unique constraint ' +
            '"events_stream_id_version_key"',
          pod_app: 'interop-be-authorization-process',
        }),
      ],
    });
    assert.deepStrictEqual(matchedIds, ['INTEROP_APIGW_IAV2A5_API-V2-DUP-EVE-VER']);
    assert.match(queries[2]?.query ?? '', /filter cid in \["purpose-cid"\]/u);
  });

  it('limits the documented connection-closed example to test', async () => {
    const access = [
      row({
        count: '1',
        status: '504',
        requestPath: '/tenants/id',
        integrationError: 'Execution failed due to a network error communicating with endpoint: Connection is closed',
      }),
    ];
    assert.deepStrictEqual((await run({ environment: 'test', access })).matchedIds, [
      'INTEROP_APIGW_IAV2A5_API-V2-END-CON-CLO',
    ]);
    assert.deepStrictEqual((await run({ environment: 'prod', access })).matchedIds, []);
  });
});
