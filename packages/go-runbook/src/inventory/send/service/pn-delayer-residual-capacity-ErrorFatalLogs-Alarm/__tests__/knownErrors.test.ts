import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeRunbookTimeRange } from '../../../../../runtime/index.js';
import { executeWithLogs } from '../../../../../__tests__/helpers/executeWithLogs.js';
import { logRow } from '../../../../../__tests__/helpers/logRow.js';
import type { RunbookLogsExecution } from '../../../../../__tests__/helpers/RunbookLogsExecution.js';
import { buildRunbook } from '../runbook.js';

const ALARM_DATETIME = '2026-10-07T21:20:49.720Z';
const PROD_MESSAGES = [
  'No PaperDeliveryDriverCapacity found for tenderId: 20260921, unifiedDeliveryDriver: Poste, geoKey: VS, deliveryDate: 2026-10-26',
  'No PaperDeliveryDriverCapacity found for tenderId: 20260921, unifiedDeliveryDriver: Sailpost, geoKey: OG, deliveryDate: 2026-10-26',
  'No PaperDeliveryDriverCapacity found for tenderId: 20260921, unifiedDeliveryDriver: Poste, geoKey: 55014, deliveryDate: 2026-10-05',
] as const;
const UAT_MESSAGES = [
  'No PaperDeliveryDriverCapacity found for tenderId: 20260123, unifiedDeliveryDriver: Fulmine, geoKey: FAKE, deliveryDate: 2026-09-14',
  'No PaperDeliveryDriverCapacity found for tenderId: 20260123, unifiedDeliveryDriver: driverRanking890, geoKey: FAKE, deliveryDate: 2026-10-19',
] as const;

/** Runs the runbook over the documented window of one occurrence whose every query returns `messages`. */
async function execute(messages: ReadonlyArray<string>): Promise<RunbookLogsExecution> {
  const runbook = buildRunbook();
  const { startTime, endTime } = computeRunbookTimeRange(runbook, { kind: 'single', at: ALARM_DATETIME });
  return executeWithLogs(
    runbook,
    { alarmName: runbook.metadata.id, alarmDatetime: ALARM_DATETIME, startTime, endTime },
    () =>
      messages.map((message) =>
        logRow({
          '@timestamp': ALARM_DATETIME,
          level: 'ERROR',
          trace_id: '6ef23619-9aca-49e5-8aed-69506bae5239:107',
          message,
          '@message': JSON.stringify({ level: 'ERROR', message }),
        }),
      ),
  );
}

function detectedIds(execution: RunbookLogsExecution): ReadonlyArray<string> {
  return execution.result.detections.map(({ knownError }) => knownError.code);
}

describe('pn-delayer residual capacity known errors', () => {
  it('recognizes the missing capacity of every driver and geoKey as the tracked defect', async () => {
    for (const message of PROD_MESSAGES) {
      const execution = await execute([message]);
      assert.deepStrictEqual(detectedIds(execution), ['SEND_SERVICE_PDRCEFLA_MIS-DRI-CAP'], message);
      assert.strictEqual(execution.draft?.kind, 'KNOWN_CASE');
      assert.strictEqual(execution.draft.proposedStatus, 'COMPLETED');
    }
  });

  it('recognizes the FAKE geoKey of UAT separately from the tracked defect', async () => {
    for (const message of UAT_MESSAGES) {
      assert.deepStrictEqual(
        detectedIds(await execute([message])),
        ['SEND_SERVICE_PDRCEFLA_MIS-DRI-CAP-FAK-GEO-UAT'],
        message,
      );
    }
  });

  it('does not take a geoKey that only starts with FAKE for the UAT case', async () => {
    const message = PROD_MESSAGES[0].replace('geoKey: VS', 'geoKey: FAKE2');
    assert.deepStrictEqual(detectedIds(await execute([message])), ['SEND_SERVICE_PDRCEFLA_MIS-DRI-CAP']);
  });

  it('leaves other delayer errors to the unknown error', async () => {
    for (const message of [
      'Error processing residual capacity job for tenderId: 20260921',
      'No PaperDeliveryDriverCapacity found for tenderId: 20260921',
    ]) {
      const execution = await execute([message]);
      assert.deepStrictEqual(detectedIds(execution), [], message);
      assert.notStrictEqual(execution.draft?.kind, 'KNOWN_CASE');
    }
  });
});
