import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeRunbookTimeRange } from '../../../../../runtime/index.js';
import { executeWithLogs } from '../../../../../__tests__/helpers/executeWithLogs.js';
import { logRow } from '../../../../../__tests__/helpers/logRow.js';
import { buildRunbook } from '../runbook.js';

const ALARM_DATETIME = '2026-11-13T08:36:55.995Z';

async function detectedIds(message: string): Promise<ReadonlyArray<string>> {
  const runbook = buildRunbook();
  const { startTime, endTime } = computeRunbookTimeRange(runbook, { kind: 'single', at: ALARM_DATETIME });
  const execution = await executeWithLogs(
    runbook,
    { alarmName: runbook.metadata.id, alarmDatetime: ALARM_DATETIME, startTime, endTime },
    () => [
      logRow({
        '@timestamp': ALARM_DATETIME,
        level: 'ERROR',
        message,
        trace_id: 'Root=1-6915a1a7-0a1b2c3d4e5f60718293a4b5',
        '@message': JSON.stringify({ level: 'ERROR', message }),
      }),
    ],
  );
  return execution.result.detections.map(({ knownCase }) => knownCase.id);
}

describe('oncall-pn-external-channel-ErrorFatalLogs-Alarm known cases', () => {
  it('recognizes both FATAL alarms of the PEC provider outage', async () => {
    for (const message of [
      '* FATAL * ALLARM!: scaricamentoEsitiPecScheduler()',
      '* FATAL * ALLARM!: CancellazioneRicevutePecService.cancellazioneRicevutePec()',
    ]) {
      assert.deepStrictEqual(await detectedIds(message), ['external-channel-pec-provider-unavailable'], message);
    }
  });

  it('leaves other FATAL alarms of the service unclassified', async () => {
    assert.deepStrictEqual(await detectedIds('* FATAL * ALLARM!: invioPecScheduler()'), []);
  });
});
