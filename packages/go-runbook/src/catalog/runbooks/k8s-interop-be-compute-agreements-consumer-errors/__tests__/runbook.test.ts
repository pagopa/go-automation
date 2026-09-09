import { COMPUTE_AGREEMENTS_CONSUMER_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveOccurrenceTimeWindow } from '../../../computeRunbookTimeRange.js';
import { service } from '../../framework.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';

import { buildRunbook } from '../runbook.js';

describe('buildRunbook', () => {
  it('builds a SERVICE-compatible read-only runbook with the expected pipeline', () => {
    const runbook = buildRunbook();

    assert.strictEqual(runbook.metadata.id, COMPUTE_AGREEMENTS_CONSUMER_ALARM.runbookKey);
    assert.deepStrictEqual(
      runbook.steps.map((descriptor) => descriptor.step.id),
      [
        COMPUTE_AGREEMENTS_CONSUMER_ALARM.stepIds.resolveContext,
        COMPUTE_AGREEMENTS_CONSUMER_ALARM.stepIds.queryApplicationLogs,
        COMPUTE_AGREEMENTS_CONSUMER_ALARM.stepIds.analyzeApplicationLogs,
        COMPUTE_AGREEMENTS_CONSUMER_ALARM.stepIds.queryCidTracker,
        COMPUTE_AGREEMENTS_CONSUMER_ALARM.stepIds.analyzeCidTracker,
      ],
    );
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.ok(service.isServiceRunbookContext(runbook.runbookContext));
    assert.strictEqual(runbook.runbookContext.service.name, COMPUTE_AGREEMENTS_CONSUMER_ALARM.podApp);
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
  });

  it('publishes the documental name, Confluence link and primary resource for Watchtower', () => {
    const runbook = buildRunbook();

    assert.deepStrictEqual(runbook.analysisDefaults, {
      runbookName: COMPUTE_AGREEMENTS_CONSUMER_ALARM.runbookKey,
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2739208193/k8s-interop-be-compute-agreements-consumer-errors-prod',
          name: COMPUTE_AGREEMENTS_CONSUMER_ALARM.runbookKey,
          type: 'CONFLUENCE',
        },
      ],
      resources: [{ name: COMPUTE_AGREEMENTS_CONSUMER_ALARM.podApp, role: 'PRIMARY' }],
    });
  });

  it('uses the catalog 5/5 occurrence window because the source page declares none', () => {
    const runbook = buildRunbook();

    assert.strictEqual(runbook.occurrenceTimeWindow, undefined);
    assert.deepStrictEqual(resolveOccurrenceTimeWindow(runbook), { beforeMinutes: 5, afterMinutes: 5 });
  });
});
