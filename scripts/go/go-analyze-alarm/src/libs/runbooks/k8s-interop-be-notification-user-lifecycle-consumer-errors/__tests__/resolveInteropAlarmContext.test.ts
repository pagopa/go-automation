import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { interop } from '@go-automation/go-runbook';

import {
  INTEROP_NOTIFICATION_USER_LIFECYCLE_ALARM_NAMES,
  INTEROP_NOTIFICATION_USER_LIFECYCLE_RUNBOOK_KEY,
  INTEROP_NOTIFICATION_USER_LIFECYCLE_SERVICE_NAME,
  resolveInteropNotificationUserLifecycleAlarmContext,
} from '../resolveInteropAlarmContext.js';

describe('resolveInteropNotificationUserLifecycleAlarmContext', () => {
  it('resolves every environment declared by the operational runbook', () => {
    for (const alarmName of INTEROP_NOTIFICATION_USER_LIFECYCLE_ALARM_NAMES) {
      const context = resolveInteropNotificationUserLifecycleAlarmContext(alarmName);
      assert.strictEqual(context.alarmName, alarmName);
      assert.strictEqual(context.runbookKey, INTEROP_NOTIFICATION_USER_LIFECYCLE_RUNBOOK_KEY);
      assert.strictEqual(context.logGroup, interop.k8s.buildInteropK8sApplicationLogGroup(context.environment));
      assert.strictEqual(context.podApp, INTEROP_NOTIFICATION_USER_LIFECYCLE_SERVICE_NAME);
    }
  });

  it('rejects alarm names outside the declared INTEROP environments', () => {
    assert.throws(
      () =>
        resolveInteropNotificationUserLifecycleAlarmContext(
          'k8s-interop-be-notification-user-lifecycle-consumer-errors-dev',
        ),
      /Unsupported INTEROP alarm name/u,
    );
  });
});
