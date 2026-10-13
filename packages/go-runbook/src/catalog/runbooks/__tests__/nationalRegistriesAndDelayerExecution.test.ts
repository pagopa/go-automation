import type { AWSCloudWatchLogsQueryResult, ResultField } from '@go-automation/go-common/aws';
import { GOLogger } from '@go-automation/go-common/core';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RunbookEngine } from '../../../core/RunbookEngine.js';
import { buildAnalysisDraft } from '../../../output/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../../registry/createTestServiceRegistry.js';
import type { Runbook } from '../../../types/Runbook.js';
import type { RunbookExecutionResult } from '../../../types/RunbookExecutionResult.js';
import { buildRunbook as buildDelayerRunbook } from '../pn-delayer-sender-limit-job-ErrorFatalLogs-Alarm/runbook.js';
import { buildRunbook as buildInadRunbook } from '../pn-national-registries-INAD-downstream-detection-Alarm/runbook.js';
import { buildRunbook as buildIpaRunbook } from '../pn-national-registries-IPA-downstream-detection-Alarm/runbook.js';
import { buildRunbook as buildInfoCamereRunbook } from '../pn-national-registries-InfoCamere-downstream-detection-Alarm/runbook.js';
import { SEND_DOWNSTREAMS } from '../framework.js';
import { computeRunbookTimeRange } from '../../computeRunbookTimeRange.js';

interface Execution {
  readonly draft: ReturnType<typeof buildAnalysisDraft>;
  readonly logGroups: ReadonlyArray<string>;
  readonly queries: ReadonlyArray<string>;
  readonly result: RunbookExecutionResult;
}

async function execute(
  runbook: Runbook,
  message: string,
  alarmDatetime = '2026-10-12T10:00:00.000Z',
): Promise<Execution> {
  const logGroups: string[] = [];
  const queries: string[] = [];
  const cloudWatchLogs = {
    async queryWithStatistics(groups: ReadonlyArray<string>, query: string): Promise<AWSCloudWatchLogsQueryResult> {
      await Promise.resolve();
      logGroups.push(...groups);
      queries.push(query);
      const rows: ReadonlyArray<ReadonlyArray<ResultField>> = [
        [
          { field: '@timestamp', value: alarmDatetime },
          { field: 'level', value: 'ERROR' },
          { field: 'message', value: message },
          { field: '@message', value: JSON.stringify({ level: 'ERROR', message }) },
        ],
      ];
      return {
        rows,
        statistics: { bytesScanned: 1, recordsScanned: 1, recordsMatched: 1 },
        queryExecutions: [],
      };
    },
  };
  const { startTime, endTime } = computeRunbookTimeRange(runbook, { kind: 'single', at: alarmDatetime });
  const result = await new RunbookEngine(new GOLogger()).execute(
    runbook,
    new Map([
      ['alarmName', runbook.metadata.id],
      ['alarmDatetime', alarmDatetime],
      ['startTime', startTime],
      ['endTime', endTime],
    ]),
    createTestServiceRegistry({ cloudWatchLogs }),
  );
  return { draft: buildAnalysisDraft(runbook, result), logGroups, queries, result };
}

describe('national registries and delayer documented execution', () => {
  it('recognizes the IPA premature closure and searches the documented structured ERROR events', async () => {
    const { draft, logGroups, queries } = await execute(
      buildIpaRunbook(),
      '[DOWNSTREAM] Service IPA returned errors=Connection prematurely closed BEFORE response',
    );
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.deepStrictEqual(draft.downstreams, [SEND_DOWNSTREAMS.IPA]);
    assert.deepStrictEqual(logGroups, ['/aws/ecs/pn-national-registries']);
    assert.match(queries[0] ?? '', /level = 'ERROR'/u);
    assert.ok(queries[0]?.includes("message like '[DOWNSTREAM] Service IPA returned errors='"));
    assert.doesNotMatch(queries[0] ?? '', /not like.*404/u);
    assert.ok(draft.links.some(({ url }) => url.includes('/2386001921/')));
  });

  it('keeps IPA HTTP 404 in the evidence and leaves its undocumented resolution open', async () => {
    const { draft, result } = await execute(
      buildIpaRunbook(),
      '[DOWNSTREAM] Service IPA returned errors=404 Not Found from POST https://www.indicepa.gov.it/example',
    );
    assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    assert.strictEqual(result.matchedCases.length, 0);
    assert.ok(draft.links.some(({ url }) => url.includes('/2386001921/')));
  });

  it('keeps the INAD HTTP 500 open and includes the documented report', async () => {
    const { draft, queries } = await execute(
      buildInadRunbook(),
      '[DOWNSTREAM] Service INAD returned errors=500 Internal Server Error from GET ' +
        'https://api.inad.gov.it/rest/inad/v1/domiciliodigitale/extract/TEST-CF',
    );
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.deepStrictEqual(draft.downstreams, [SEND_DOWNSTREAMS.INAD]);
    assert.ok(draft.links.some(({ url }) => url.endsWith('/p1790939699138239')));
    assert.ok(draft.links.some(({ url }) => url.includes('/2363785411/')));
    assert.ok(queries[0]?.includes("@message not like '[DOWNSTREAM] Service INAD returned errors=404'"));
    assert.doesNotMatch(draft.conclusionNotes, /rientrato al polling|ripristinato/u);
  });

  it('keeps the documented InfoCamere HTTP 500 open for Slack and identifier-masking checks', async () => {
    const { draft, queries } = await execute(
      buildInfoCamereRunbook(),
      '[DOWNSTREAM] Service InfoCamere returned errors=500 Internal Server Error from GET ' +
        'https://icapis.infocamere.it/ic/pe/wspa/wspa/rest/listaLegaleRappresentante/***;' +
        '{"code":"WSPA_ERR_00","appName":"wspa-lref","description":"Internal Server Error!"}',
    );
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.deepStrictEqual(draft.finalActions, [
      'Consultare il thread Slack del 30/09/2025',
      'Verificare l’oscuramento del codice fiscale nei log',
    ]);
    assert.deepStrictEqual(draft.downstreams, [SEND_DOWNSTREAMS.ELENCO_LEGALE_RAPPRESENTANTE_INFOCAMERE]);
    assert.match(queries[0] ?? '', /level = 'ERROR'/u);
    assert.ok(queries[0]?.includes("message like '[DOWNSTREAM] Service InfoCamere returned errors='"));
    assert.ok(draft.links.some(({ url }) => url.endsWith('/p1759230886444479')));
    assert.ok(draft.links.some(({ url }) => url.includes('/2981101710/')));
  });

  it('keeps an InfoCamere HTTP 500 with a different code open for investigation', async () => {
    const { draft, result } = await execute(
      buildInfoCamereRunbook(),
      '[DOWNSTREAM] Service InfoCamere returned errors=500 Internal Server Error from GET ' +
        'https://icapis.infocamere.it/ic/pe/wspa/wspa/rest/listaLegaleRappresentante/TEST-CF;' +
        '{"code":"OTHER_ERROR","appName":"wspa-lref"}',
    );
    assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    assert.strictEqual(result.matchedCases.length, 0);
  });

  it('requires product and workflow checks for missing drivers on Monday in Rome', async () => {
    const { draft, queries, result } = await execute(
      buildDelayerRunbook(),
      'No drivers found for province: RM',
      '2026-09-27T22:30:00.000Z',
    );
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.deepStrictEqual(
      result.matchedCases.map(({ id }) => id),
      ['no-drivers-monday'],
    );
    assert.match(draft.errorDetails ?? '', /Nessun driver/u);
    assert.doesNotMatch(draft.errorDetails ?? '', /percentuale|senza retry/iu);
    assert.deepStrictEqual(draft.finalActions, [
      'Avvisare il prodotto',
      'Verificare la presenza dell’allarme pn-BatchWorkflowStateMachine-FailedAlarm',
    ]);
    assert.match(queries[0] ?? '', /\| dedup message\n\| limit 1000$/u);
    assert.ok(draft.links.some(({ url }) => url.endsWith('/p1790861502607049')));
    assert.ok(draft.links.some(({ url }) => url.endsWith('/p1790086829253919')));
  });

  it('requires no operational action for missing drivers on another day', async () => {
    const { draft, result } = await execute(
      buildDelayerRunbook(),
      'No drivers found for province: RM',
      '2026-09-29T10:00:00.000Z',
    );
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'COMPLETED');
    assert.deepStrictEqual(
      result.matchedCases.map(({ id }) => id),
      ['no-drivers-other-day'],
    );
    assert.deepStrictEqual(draft.finalActions, []);
    assert.match(draft.errorDetails ?? '', /Nessun driver/u);
    assert.doesNotMatch(draft.errorDetails ?? '', /percentuale|senza retry/iu);
  });
});
