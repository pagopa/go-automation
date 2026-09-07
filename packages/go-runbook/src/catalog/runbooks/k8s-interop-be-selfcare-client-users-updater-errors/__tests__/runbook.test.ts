import { SELFCARE_USERS_UPDATER_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { service } from '../../framework.js';

import { buildRunbook } from '../runbook.js';

describe('buildRunbook', () => {
  it('builds a SERVICE-compatible read-only runbook with the expected pipeline', () => {
    const runbook = buildRunbook();

    assert.strictEqual(runbook.metadata.id, SELFCARE_USERS_UPDATER_ALARM.runbookKey);
    assert.deepStrictEqual(
      runbook.steps.map((descriptor) => descriptor.step.id),
      [
        SELFCARE_USERS_UPDATER_ALARM.stepIds.resolveContext,
        SELFCARE_USERS_UPDATER_ALARM.stepIds.queryApplicationLogs,
        SELFCARE_USERS_UPDATER_ALARM.stepIds.analyzeApplicationLogs,
        SELFCARE_USERS_UPDATER_ALARM.stepIds.queryCidTracker,
        SELFCARE_USERS_UPDATER_ALARM.stepIds.analyzeCidTracker,
      ],
    );
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 5, afterMinutes: 1 });
    assert.ok(service.isServiceRunbookContext(runbook.runbookContext));
    assert.strictEqual(runbook.runbookContext.service.name, SELFCARE_USERS_UPDATER_ALARM.podApp);
  });
});
