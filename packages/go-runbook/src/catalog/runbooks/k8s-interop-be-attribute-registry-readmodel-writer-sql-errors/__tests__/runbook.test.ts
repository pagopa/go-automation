import { ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveOccurrenceTimeWindow } from '../../../computeRunbookTimeRange.js';
import { service } from '../../framework.js';

import { buildRunbook } from '../runbook.js';

describe('buildRunbook', () => {
  it('builds a SERVICE-compatible read-only runbook with the expected pipeline', () => {
    const runbook = buildRunbook();

    assert.strictEqual(runbook.metadata.id, ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.runbookKey);
    assert.deepStrictEqual(
      runbook.steps.map((descriptor) => descriptor.step.id),
      [
        ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.stepIds.resolveContext,
        ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.stepIds.queryApplicationLogs,
        ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.stepIds.analyzeApplicationLogs,
        ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.stepIds.queryCidTracker,
        ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.stepIds.analyzeCidTracker,
      ],
    );
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.ok(service.isServiceRunbookContext(runbook.runbookContext));
    assert.strictEqual(runbook.runbookContext.service.name, ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.podApp);
  });

  it('publishes the documental name and primary resource in Watchtower analysis defaults', () => {
    const runbook = buildRunbook();

    assert.deepStrictEqual(runbook.analysisDefaults, {
      runbookName: ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.runbookKey,
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3294068772/k8s-interop-be-attribute-registry-readmodel-writer-sql-errors',
          name: ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.runbookKey,
          type: 'CONFLUENCE',
        },
      ],
      resources: [{ name: ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.podApp, role: 'PRIMARY' }],
    });
  });

  it('uses the catalog 5/5 occurrence window because the source page declares none', () => {
    const runbook = buildRunbook();

    assert.strictEqual(runbook.occurrenceTimeWindow, undefined);
    assert.deepStrictEqual(resolveOccurrenceTimeWindow(runbook), { beforeMinutes: 5, afterMinutes: 5 });
  });
});
