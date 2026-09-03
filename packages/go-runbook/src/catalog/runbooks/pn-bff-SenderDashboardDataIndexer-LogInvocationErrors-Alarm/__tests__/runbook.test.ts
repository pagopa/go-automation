import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { buildRunbook } from '../runbook.js';
import { SENDER_DASHBOARD_DATA_INDEXER_ALARM } from '../registration.js';

describe('SenderDashboardDataIndexer runbook', () => {
  it('builds a read-only scheduled Lambda runbook with structured analysis defaults', () => {
    const runbook = buildRunbook();

    assert.strictEqual(runbook.metadata.id, SENDER_DASHBOARD_DATA_INDEXER_ALARM);
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.deepStrictEqual(runbook.analysisDefaults?.resources, [
      { name: 'pn-bff-SenderDashboardDataIndexer', role: 'PRIMARY' },
    ]);
    assert.strictEqual(runbook.analysisDefaults?.runbookName, SENDER_DASHBOARD_DATA_INDEXER_ALARM);
    assert.strictEqual(runbook.analysisDefaults?.links?.length, 3);

    const context = runbook.runbookContext;
    assert.ok(context !== undefined && typeof context === 'object');
    assert.deepStrictEqual(context, {
      kind: 'lambda',
      lambda: {
        name: 'pn-bff-SenderDashboardDataIndexer',
        logGroup: '/aws/lambda/pn-bff-SenderDashboardDataIndexer',
        varPrefix: 'senderDashboardDataIndexer',
        eventSource: 'scheduled',
        configuredTimeoutMs: 900_000,
      },
      downstreams: [],
      queryProfileId: 'send',
    });
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
  });
});
