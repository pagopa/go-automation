import { SELFCARE_ONBOARDING_CONSUMER_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { interop } from '../../framework.js';

describe('SELFCARE_ONBOARDING_CONSUMER_ALARM.resolveContext', () => {
  it('resolves every supported environment-specific alarm to the same canonical runbook key', () => {
    for (const alarmName of SELFCARE_ONBOARDING_CONSUMER_ALARM.alarmNames) {
      const context = SELFCARE_ONBOARDING_CONSUMER_ALARM.resolveContext(alarmName);
      assert.strictEqual(context.alarmName, alarmName);
      assert.strictEqual(context.runbookKey, SELFCARE_ONBOARDING_CONSUMER_ALARM.runbookKey);
      assert.strictEqual(context.logGroup, interop.k8s.buildInteropK8sApplicationLogGroup(context.environment));
      assert.strictEqual(context.podApp, SELFCARE_ONBOARDING_CONSUMER_ALARM.podApp);
    }
  });

  it('rejects alarm names outside the declared INTEROP environments', () => {
    assert.throws(
      () => SELFCARE_ONBOARDING_CONSUMER_ALARM.resolveContext('k8s-interop-be-selfcare-onboarding-consumer-errors-dev'),
      /Unsupported INTEROP alarm name/u,
    );
  });
});
