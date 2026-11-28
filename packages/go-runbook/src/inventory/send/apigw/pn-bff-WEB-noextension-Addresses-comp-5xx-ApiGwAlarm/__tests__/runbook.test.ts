import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRunbook } from '../runbook.js';
import { API_GW_LOG_GROUP } from '../knownServices.js';
import { executeWithLogs } from '../../../../../__tests__/helpers/executeWithLogs.js';
import { logRow } from '../../../../../__tests__/helpers/logRow.js';
import type { RunbookLogsExecution } from '../../../../../__tests__/helpers/RunbookLogsExecution.js';
import { treeNodeVars } from '../../../../../__tests__/helpers/treeNodeVars.js';

const ALARM = 'pn-bff-WEB-noextension-Addresses-comp-5xx-ApiGwAlarm';
const ROOT = '1-68ef9670-111111111111111111111111';
const TIMEOUT =
  'Ending process _getAddressesV1 with errors=nested exception is io.netty.handler.timeout.ReadTimeoutException';

interface Scenario {
  readonly authorizerStatus?: string;
  readonly authorizerLatency?: string;
  readonly errorMessage?: string;
  readonly messages?: ReadonlyArray<string>;
}

async function execute(scenario: Scenario = {}): Promise<RunbookLogsExecution> {
  const execution = await executeWithLogs(
    buildRunbook(),
    { alarmName: ALARM, startTime: '2026-10-15T11:55:29.929Z', endTime: '2026-10-15T12:05:29.929Z' },
    (_query, [group = '']) => {
      if (group === API_GW_LOG_GROUP) {
        return [
          logRow({
            status: '500',
            httpMethod: 'GET',
            path: '/bff/v1/addresses',
            xrayTraceId: `Root=${ROOT}`,
            requestId: 'request-id',
            authorizerStatus: scenario.authorizerStatus ?? '200',
            authorizerLatency: scenario.authorizerLatency ?? '5',
            integrationServiceStatus: '500',
            errorMessage: scenario.errorMessage ?? '-',
          }),
        ];
      }
      if (group.startsWith('API-Gateway-Execution-Logs_')) return [];
      assert.equal(group, '/aws/ecs/pn-bff');
      return (scenario.messages ?? [TIMEOUT]).map((message) =>
        logRow({
          level: 'WARN',
          message,
          trace_id: ROOT,
          '@message': JSON.stringify({ level: 'WARN', message, trace_id: ROOT }),
        }),
      );
    },
  );
  assert.ok(execution.queries.every(({ resolutionMode }) => resolutionMode === 'search-configured-profiles'));
  return execution;
}

describe('WEB Addresses API Gateway runbook', () => {
  it('recognizes the documented WARN timeout and retains the full X-Ray root', async () => {
    const { result, draft, queries } = await execute();
    assert.equal(result.status, 'completed');
    assert.deepEqual(
      result.detections.map(({ knownError }) => knownError.code),
      ['SEND_APIGW_PBWEBNAC5AGA_BFF-GET-ADD-REA-TIM'],
    );
    assert.equal(draft?.kind, 'KNOWN_CASE');
    assert.equal(draft.proposedStatus, 'IN_PROGRESS');
    assert.equal(draft.conclusionNotes, 'Risoluzione non documentata.');
    assert.deepEqual(draft.finalActions, []);
    assert.equal(treeNodeVars(result).get('xRayTraceId'), ROOT);
    const bff = queries.find(({ groups }) => groups[0] === '/aws/ecs/pn-bff');
    assert.ok(bff);
    assert.ok(bff.query.includes(ROOT));
    assert.ok(!bff.query.includes("level == 'ERROR'"));
  });

  it('continues to application evidence after an empty execution-log enrichment', async () => {
    const { result, queries } = await execute({ errorMessage: 'Execution failed due to an internal error' });
    assert.ok(queries.some(({ groups }) => groups[0]?.startsWith('API-Gateway-Execution-Logs_') === true));
    assert.ok(queries.some(({ groups }) => groups[0] === '/aws/ecs/pn-bff'));
    assert.equal(result.detections[0]?.knownError.code, 'SEND_APIGW_PBWEBNAC5AGA_BFF-GET-ADD-REA-TIM');
  });

  it('recognizes the configured authorizer timeout without declaring recovery', async () => {
    const { result, draft, queries } = await execute({ authorizerStatus: '500', authorizerLatency: '5000' });
    assert.equal(result.detections[0]?.knownError.code, 'SEND_APIGW_COMMON_API-GW-AUT-TIM');
    assert.equal(draft?.kind, 'KNOWN_CASE');
    assert.equal(draft?.proposedStatus, 'IN_PROGRESS');
    assert.equal(draft?.conclusionNotes, 'Risoluzione non documentata.');
    assert.ok(queries.every(({ groups }) => groups[0] !== '/aws/ecs/pn-bff'));
  });

  it('does not classify an undocumented operation or a generic BFF failure', async () => {
    for (const messages of [
      [],
      ['ERROR - Internal Server Error'],
      [TIMEOUT.replace('_getAddressesV1', '_deleteAddressV1')],
    ]) {
      const { result, draft } = await execute({ messages });
      assert.deepEqual(result.detections, []);
      assert.equal(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    }
  });

  it('keeps a later successful log from closing the documented timeout', async () => {
    const { draft } = await execute({ messages: [TIMEOUT, 'Request completed successfully'] });
    assert.equal(draft?.kind, 'KNOWN_CASE');
    assert.equal(draft?.proposedStatus, 'IN_PROGRESS');
    assert.deepEqual(draft?.finalActions, []);
  });
});
