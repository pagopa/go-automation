import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOLogger } from '@pagopa/go-common/logging';
import {
  assertAnalysisAnnotations,
  assertCloudExecutableRunbook,
  buildAnalysisDraft,
  createTestServiceRegistry,
  SEND_ACCOUNTS,
} from '../../../../../toolkits/send/index.js';
import { OperationalRunbookEngine } from '../../../../../toolkits/common/engine/OperationalRunbookEngine.js';
import {
  fakeReader,
  occurrenceIn,
  SEND_ACCOUNT_IDS,
  sendAccountsPort,
  SEND_TEST_ENVIRONMENT,
} from '../../../../../toolkits/send/accounts/__tests__/fixtures.js';
import { RUNBOOK_CATALOG } from '../../../../index.js';
import { buildRunbook } from '../runbook.js';
import { ERROR_QUERY, SPIDHUB_ALARM, RUNBOOK_URL } from '../alarmDefinition.js';
import { DOWNSTREAM_CATALOGS } from '../../../../validation/DOWNSTREAM_CATALOGS.js';

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
    assert.doesNotThrow(() => assertAnalysisAnnotations(runbook, 'SEND', DOWNSTREAM_CATALOGS.SEND));
  });

  for (const message of [
    '',
    'Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent to the client',
    '[io-spid-commons] error: Spid Authentication|Authentication Error|ERROR=Error: Value attribute of StatusCode is invalid: urn:oasis:names:tc:SAML:2.0:status:Responder',
  ]) {
    it(`keeps ${message === '' ? 'empty evidence' : message.includes('HEADERS') ? 'headers errors' : 'the historical SAML signature'} open for HTTP correlation`, async () => {
      const queries: string[] = [];
      const runbook = buildRunbook();
      const result = await new OperationalRunbookEngine(new GOLogger()).execute(
        runbook,
        new Map([
          ['startTime', '2026-09-18T08:47:13Z'],
          ['endTime', '2026-09-18T08:57:13Z'],
        ]),
        createTestServiceRegistry({
          awsAccounts: sendAccountsPort({
            ...occurrenceIn(SEND_ACCOUNT_IDS.confinfoProd),
            readers: {
              [SEND_ACCOUNTS.confinfo]: fakeReader({
                // eslint-disable-next-line @typescript-eslint/require-await
                async query(_groups: ReadonlyArray<string>, query: string) {
                  queries.push(query);
                  return query === ERROR_QUERY && message !== '' ? [[{ field: '@message', value: message }]] : [];
                },
              }),
            },
          }),
        }),
        SEND_TEST_ENVIRONMENT,
      );
      assert.strictEqual(result.status, 'completed');
      assert.strictEqual(queries.length, 2);
      assert.strictEqual(result.finalContext.vars.get('spidHubAccountId'), SEND_ACCOUNT_IDS.confinfoProd);
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
