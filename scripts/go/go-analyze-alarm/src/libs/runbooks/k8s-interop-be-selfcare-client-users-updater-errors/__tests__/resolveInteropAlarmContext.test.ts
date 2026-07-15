import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { interop } from '@go-automation/go-runbook';

import {
  INTEROP_SELFCARE_USERS_UPDATER_ALARM_NAMES,
  INTEROP_SELFCARE_USERS_UPDATER_RUNBOOK_KEY,
  INTEROP_SELFCARE_USERS_UPDATER_SERVICE_NAME,
  resolveInteropSelfcareUsersUpdaterAlarmContext,
} from '../resolveInteropAlarmContext.js';

describe('resolveInteropSelfcareUsersUpdaterAlarmContext', () => {
  it('resolves every supported environment-specific alarm to the same canonical runbook key', () => {
    for (const alarmName of INTEROP_SELFCARE_USERS_UPDATER_ALARM_NAMES) {
      const context = resolveInteropSelfcareUsersUpdaterAlarmContext(alarmName);
      assert.strictEqual(context.alarmName, alarmName);
      assert.strictEqual(context.runbookKey, INTEROP_SELFCARE_USERS_UPDATER_RUNBOOK_KEY);
      assert.strictEqual(context.logGroup, interop.k8s.buildInteropK8sApplicationLogGroup(context.environment));
      assert.strictEqual(context.podApp, INTEROP_SELFCARE_USERS_UPDATER_SERVICE_NAME);
    }
  });

  it('rejects alarm names outside the declared INTEROP environments', () => {
    assert.throws(
      () => resolveInteropSelfcareUsersUpdaterAlarmContext('k8s-interop-be-selfcare-client-users-updater-errors-dev'),
      /Unsupported INTEROP alarm name/u,
    );
  });
});
