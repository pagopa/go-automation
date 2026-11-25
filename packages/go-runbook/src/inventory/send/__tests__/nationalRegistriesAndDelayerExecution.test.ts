import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Runbook } from '../../../engine/index.js';
import { SEND_DOWNSTREAMS } from '../../../toolkits/send/index.js';
import { computeRunbookTimeRange } from '../../../runtime/index.js';
import { buildRunbook as buildDelayerRunbook } from '../service/pn-delayer-sender-limit-job-ErrorFatalLogs-Alarm/runbook.js';
import { buildRunbook as buildInadRunbook } from '../downstream/pn-national-registries-INAD-downstream-detection-Alarm/runbook.js';
import { buildRunbook as buildIpaRunbook } from '../downstream/pn-national-registries-IPA-downstream-detection-Alarm/runbook.js';
import { buildRunbook as buildInfoCamereRunbook } from '../downstream/pn-national-registries-InfoCamere-downstream-detection-Alarm/runbook.js';
import { executeWithLogs } from '../../../__tests__/helpers/executeWithLogs.js';
import { logRow } from '../../../__tests__/helpers/logRow.js';
import type { RunbookLogsExecution } from '../../../__tests__/helpers/RunbookLogsExecution.js';

const INFOCAMERE_LEGAL_REPRESENTATIVE =
  '[DOWNSTREAM] Service InfoCamere returned errors=500 Internal Server Error from GET ' +
  'https://icapis.infocamere.it/ic/pe/wspa/wspa/rest/listaLegaleRappresentante/';

/** Runs a runbook over the documented window of one occurrence whose every query returns `message`. */
async function execute(
  runbook: Runbook,
  message: string,
  alarmDatetime = '2026-10-12T10:00:00.000Z',
): Promise<RunbookLogsExecution> {
  const { startTime, endTime } = computeRunbookTimeRange(runbook, { kind: 'single', at: alarmDatetime });
  return executeWithLogs(runbook, { alarmName: runbook.metadata.id, alarmDatetime, startTime, endTime }, () => [
    logRow({
      '@timestamp': alarmDatetime,
      level: 'ERROR',
      message,
      '@message': JSON.stringify({ level: 'ERROR', message }),
    }),
  ]);
}

describe('national registries and delayer documented execution', () => {
  it('recognizes the documented downstream failures end to end, keeping their analysis open', async () => {
    for (const [runbook, message, downstream] of [
      [
        buildIpaRunbook(),
        '[DOWNSTREAM] Service IPA returned errors=Connection prematurely closed BEFORE response',
        SEND_DOWNSTREAMS.IPA,
      ],
      [
        buildInadRunbook(),
        '[DOWNSTREAM] Service INAD returned errors=500 Internal Server Error from GET ' +
          'https://api.inad.gov.it/rest/inad/v1/domiciliodigitale/extract/TEST-CF',
        SEND_DOWNSTREAMS.INAD,
      ],
      [
        buildInfoCamereRunbook(),
        `${INFOCAMERE_LEGAL_REPRESENTATIVE}***;` +
          '{"code":"WSPA_ERR_00","appName":"wspa-lref","description":"Internal Server Error!"}',
        SEND_DOWNSTREAMS.ELENCO_LEGALE_RAPPRESENTANTE_INFOCAMERE,
      ],
    ] as const) {
      const { draft, queries } = await execute(runbook, message);
      assert.strictEqual(draft?.kind, 'KNOWN_CASE', runbook.metadata.id);
      assert.deepStrictEqual(draft.downstreams, [downstream]);
      assert.doesNotMatch(draft.conclusionNotes, /rientrato al polling|ripristinato/u);
      assert.strictEqual(queries[0]?.groups[0], '/aws/ecs/pn-national-registries');
    }
  });

  it('keeps undocumented IPA 404 and other InfoCamere codes unknown, for investigation', async () => {
    for (const [runbook, message] of [
      [
        buildIpaRunbook(),
        '[DOWNSTREAM] Service IPA returned errors=404 Not Found from POST https://www.indicepa.gov.it/example',
      ],
      [
        buildInfoCamereRunbook(),
        `${INFOCAMERE_LEGAL_REPRESENTATIVE}TEST-CF;{"code":"OTHER_ERROR","appName":"wspa-lref"}`,
      ],
    ] as const) {
      const { draft, result } = await execute(runbook, message);
      assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT', runbook.metadata.id);
      assert.deepStrictEqual(result.detections, []);
      assert.ok(draft.links.length > 0, 'the unknown case keeps the runbook references');
    }
  });

  it('classifies missing drivers by the Rome day of the occurrence', async () => {
    for (const [alarmDatetime, caseId, proposedStatus] of [
      ['2026-09-27T22:30:00.000Z', 'no-drivers-monday', 'IN_PROGRESS'],
      ['2026-09-29T10:00:00.000Z', 'no-drivers-other-day', 'COMPLETED'],
    ] as const) {
      const { draft, result } = await execute(
        buildDelayerRunbook(),
        'No drivers found for province: RM',
        alarmDatetime,
      );
      assert.deepStrictEqual(
        result.detections.map(({ knownCase }) => knownCase.id),
        [caseId],
      );
      assert.strictEqual(draft?.kind, 'KNOWN_CASE');
      assert.strictEqual(draft.proposedStatus, proposedStatus);
      assert.match(draft.errorDetails ?? '', /Nessun driver/u);
      assert.doesNotMatch(draft.errorDetails ?? '', /percentuale|senza retry/iu);
    }
  });
});
