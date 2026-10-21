import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOLogger } from '@go-automation/go-common/core';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { assertAnalysisAnnotations } from '../../../../validation/assertAnalysisAnnotations.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { RUNBOOK_CATALOG } from '../../../RunbookCatalog.js';
import { buildRunbook } from '../runbook.js';
import { ERROR_QUERY, SPIDHUB_ALARM, RUNBOOK_URL } from '../alarmDefinition.js';

describe('SPID Hub external ALB runbook', () => {
  it('registers production only, declares its existing census resource and stays read-only', () => {
    const runbook = buildRunbook();
    assert.strictEqual(RUNBOOK_CATALOG.resolveByAlarmName(SPIDHUB_ALARM)?.descriptor.key, SPIDHUB_ALARM);
    assert.strictEqual(RUNBOOK_CATALOG.resolveByAlarmName('spidhub-uat-ExternalELBAlarm'), undefined);
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 5, afterMinutes: 5 });
    assert.deepStrictEqual(runbook.analysisDefaults?.resources, [
      { name: 'pn-hub-spid-login-aws', type: 'Service', role: 'PRIMARY' },
    ]);
    assert.strictEqual(runbook.analysisDefaults?.links?.[0]?.url, RUNBOOK_URL);
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.doesNotThrow(() => assertAnalysisAnnotations(runbook, 'SEND'));
  });

  for (const message of [
    '',
    'Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent to the client',
    '[io-spid-commons] error: Spid Authentication|Authentication Error|ERROR=Error: Value attribute of StatusCode is invalid: urn:oasis:names:tc:SAML:2.0:status:Responder',
  ]) {
    it(`keeps ${message === '' ? 'empty evidence' : message.includes('HEADERS') ? 'headers errors' : 'the historical SAML signature'} open for HTTP correlation`, async () => {
      const queries: string[] = [];
      const runbook = buildRunbook();
      const result = await new RunbookEngine(new GOLogger()).execute(
        runbook,
        new Map([
          ['startTime', '2026-09-18T08:47:13Z'],
          ['endTime', '2026-09-18T08:57:13Z'],
        ]),
        createTestServiceRegistry({
          cloudWatchLogs: {
            forTarget() {
              return {
                // eslint-disable-next-line @typescript-eslint/require-await
                async query(_groups: ReadonlyArray<string>, query: string) {
                  queries.push(query);
                  return query === ERROR_QUERY && message !== '' ? [[{ field: '@message', value: message }]] : [];
                },
              };
            },
          },
        }),
      );
      assert.strictEqual(result.status, 'completed');
      assert.strictEqual(queries.length, 2);
      const draft = buildAnalysisDraft(runbook, result);
      if (message === '') {
        assert.notStrictEqual(draft?.kind, 'KNOWN_CASE');
        return;
      }
      assert.strictEqual(draft?.kind, 'KNOWN_CASE');
      assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');

      assert.doesNotMatch(draft.conclusionNotes, /Analisi conclusa in autonomia/u);
    });
  }
});
