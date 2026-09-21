import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { DOWNSTREAM_MONITORING_LAMBDA_ALARM } from '../registration.js';
import { buildRunbook } from '../runbook.js';

describe('pn-downstream-monitoring-lambda runbook', () => {
  it('builds a read-only SEND Lambda runbook with its operational references', () => {
    const runbook = buildRunbook();

    assert.strictEqual(runbook.metadata.id, DOWNSTREAM_MONITORING_LAMBDA_ALARM);
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.deepStrictEqual(runbook.analysisDefaults?.resources, [
      { name: 'pn-downstream-monitoring-lambda', role: 'PRIMARY' },
    ]);
    assert.strictEqual(runbook.analysisDefaults?.runbookName, DOWNSTREAM_MONITORING_LAMBDA_ALARM);
    assert.deepStrictEqual(
      runbook.analysisDefaults?.links?.map(({ type }) => type),
      ['CONFLUENCE', 'SLACK'],
    );
    assert.deepStrictEqual(runbook.runbookContext, {
      kind: 'lambda',
      lambda: {
        name: 'pn-downstream-monitoring-lambda',
        logGroup: '/aws/lambda/pn-downstream-monitoring-lambda',
        varPrefix: 'downstreamMonitoring',
        eventSource: 'cloudwatch-logs',
        configuredTimeoutMs: 60_000,
      },
      downstreams: [],
      queryProfileId: 'send',
    });
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
  });
});
