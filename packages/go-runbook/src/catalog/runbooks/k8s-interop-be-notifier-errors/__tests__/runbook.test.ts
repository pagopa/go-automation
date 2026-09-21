import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RUNBOOK_CATALOG } from '../../../RunbookCatalog.js';
import { service } from '../../framework.js';
import { NOTIFIER_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';

describe('notifier runbook', () => {
  it('is registered for prod, att and test', () => {
    for (const alarmName of alarm.alarmNames) {
      assert.strictEqual(RUNBOOK_CATALOG.resolveByAlarmName(alarmName)?.descriptor.key, alarm.runbookKey);
    }
    assert.strictEqual(RUNBOOK_CATALOG.resolveByKey(alarm.runbookKey)?.descriptor.key, alarm.runbookKey);
  });

  it('builds a SERVICE-compatible read-only pipeline with the documented time window', () => {
    const runbook = buildRunbook();

    assert.strictEqual(runbook.metadata.id, alarm.runbookKey);
    assert.deepStrictEqual(
      runbook.steps.map(({ step }) => step.id),
      [
        alarm.stepIds.resolveContext,
        alarm.stepIds.queryApplicationLogs,
        alarm.stepIds.analyzeApplicationLogs,
        alarm.stepIds.queryCidTracker,
        alarm.stepIds.analyzeCidTracker,
      ],
    );
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 5, afterMinutes: 1 });
    assert.ok(service.isServiceRunbookContext(runbook.runbookContext));
    assert.strictEqual(runbook.runbookContext.service.name, 'interop-be-notifier');
  });
});
