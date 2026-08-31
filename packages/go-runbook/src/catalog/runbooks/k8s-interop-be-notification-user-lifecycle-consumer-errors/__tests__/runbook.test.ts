import { NOTIFICATION_USER_LIFECYCLE_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { service } from '../../framework.js';

import { buildK8sInteropBeNotificationUserLifecycleConsumerErrorsRunbook } from '../runbook.js';

describe('buildK8sInteropBeNotificationUserLifecycleConsumerErrorsRunbook', () => {
  it('builds a SERVICE-compatible read-only runbook with the expected pipeline', () => {
    const runbook = buildK8sInteropBeNotificationUserLifecycleConsumerErrorsRunbook();

    assert.strictEqual(runbook.metadata.id, NOTIFICATION_USER_LIFECYCLE_ALARM.runbookKey);
    assert.deepStrictEqual(
      runbook.steps.map((descriptor) => descriptor.step.id),
      [
        NOTIFICATION_USER_LIFECYCLE_ALARM.stepIds.resolveContext,
        NOTIFICATION_USER_LIFECYCLE_ALARM.stepIds.queryApplicationLogs,
        NOTIFICATION_USER_LIFECYCLE_ALARM.stepIds.analyzeApplicationLogs,
        NOTIFICATION_USER_LIFECYCLE_ALARM.stepIds.queryCidTracker,
        NOTIFICATION_USER_LIFECYCLE_ALARM.stepIds.analyzeCidTracker,
      ],
    );
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.ok(service.isServiceRunbookContext(runbook.runbookContext));
    assert.strictEqual(runbook.runbookContext.service.name, NOTIFICATION_USER_LIFECYCLE_ALARM.podApp);
  });
});
