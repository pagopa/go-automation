import { NOTIFICATION_USER_LIFECYCLE_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { interop } from '../../framework.js';

describe('NOTIFICATION_USER_LIFECYCLE_ALARM.resolveContext', () => {
  it('resolves every environment declared by the operational runbook', () => {
    for (const alarmName of NOTIFICATION_USER_LIFECYCLE_ALARM.alarmNames) {
      const context = NOTIFICATION_USER_LIFECYCLE_ALARM.resolveContext(alarmName);
      assert.strictEqual(context.alarmName, alarmName);
      assert.strictEqual(context.runbookKey, NOTIFICATION_USER_LIFECYCLE_ALARM.runbookKey);
      assert.strictEqual(context.logGroup, interop.k8s.buildInteropK8sApplicationLogGroup(context.environment));
      assert.strictEqual(context.podApp, NOTIFICATION_USER_LIFECYCLE_ALARM.podApp);
    }
  });

  it('rejects alarm names outside the declared INTEROP environments', () => {
    assert.throws(
      () =>
        NOTIFICATION_USER_LIFECYCLE_ALARM.resolveContext(
          'k8s-interop-be-notification-user-lifecycle-consumer-errors-dev',
        ),
      /Unsupported INTEROP alarm name/u,
    );
  });
});
