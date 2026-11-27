import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeRunbookTimeRange } from '../../../../../runtime/index.js';
import { executeWithLogs } from '../../../../../__tests__/helpers/executeWithLogs.js';
import { logRow } from '../../../../../__tests__/helpers/logRow.js';
import type { RunbookLogsExecution } from '../../../../../__tests__/helpers/RunbookLogsExecution.js';
import { buildRunbook } from '../runbook.js';

const ALARM_DATETIME = '2026-11-04T14:20:00.000Z';
const SEDE_500 =
  '[DOWNSTREAM] Service InfoCamere returned errors=500 Internal Server Error from POST https://icapis.infocamere.it/ic/pe/wspa/wspa/rest/sede/02236560161;{"code":"WSPA_ERR_00","description":"Internal Server Error!"}';

async function detectedIds(message: string): Promise<ReadonlyArray<string>> {
  const runbook = buildRunbook();
  const { startTime, endTime } = computeRunbookTimeRange(runbook, { kind: 'single', at: ALARM_DATETIME });
  const execution: RunbookLogsExecution = await executeWithLogs(
    runbook,
    { alarmName: runbook.metadata.id, alarmDatetime: ALARM_DATETIME, startTime, endTime },
    () => [
      logRow({
        '@timestamp': ALARM_DATETIME,
        level: 'ERROR',
        message,
        trace_id: 'Root=1-6909f0c1-0b6a0f3a1c2d4e5f6a7b8c9d',
        '@message': JSON.stringify({ level: 'ERROR', message }),
      }),
    ],
  );
  return execution.result.detections.map(({ knownCase }) => knownCase.id);
}

describe('pn-national-registries InfoCamere known cases', () => {
  it('recognizes the HTTP 500 of the sede request', async () => {
    assert.deepStrictEqual(await detectedIds(SEDE_500), ['infocamere-sede-internal-server-error-500']);
  });

  it('does not take another status or another InfoCamere endpoint for the sede case', async () => {
    for (const message of [
      SEDE_500.replace('500 Internal Server Error', '404 Not Found'),
      SEDE_500.replace('/rest/sede/', '/rest/getElencoPec/'),
    ]) {
      assert.ok(!(await detectedIds(message)).includes('infocamere-sede-internal-server-error-500'), message);
    }
  });
});
