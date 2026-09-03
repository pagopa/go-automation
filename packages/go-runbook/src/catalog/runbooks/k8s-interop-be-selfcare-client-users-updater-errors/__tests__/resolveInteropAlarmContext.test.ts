import { SELFCARE_USERS_UPDATER_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { interop } from '../../framework.js';

describe('SELFCARE_USERS_UPDATER_ALARM.resolveContext', () => {
  it('resolves every supported environment-specific alarm to the same canonical runbook key', () => {
    for (const alarmName of SELFCARE_USERS_UPDATER_ALARM.alarmNames) {
      const context = SELFCARE_USERS_UPDATER_ALARM.resolveContext(alarmName);
      assert.strictEqual(context.alarmName, alarmName);
      assert.strictEqual(context.runbookKey, SELFCARE_USERS_UPDATER_ALARM.runbookKey);
      assert.strictEqual(context.logGroup, interop.k8s.buildInteropK8sApplicationLogGroup(context.environment));
      assert.strictEqual(context.podApp, SELFCARE_USERS_UPDATER_ALARM.podApp);
    }
  });

  it('rejects alarm names outside the declared INTEROP environments', () => {
    assert.throws(
      () => SELFCARE_USERS_UPDATER_ALARM.resolveContext('k8s-interop-be-selfcare-client-users-updater-errors-dev'),
      /Unsupported INTEROP alarm name/u,
    );
  });
});
