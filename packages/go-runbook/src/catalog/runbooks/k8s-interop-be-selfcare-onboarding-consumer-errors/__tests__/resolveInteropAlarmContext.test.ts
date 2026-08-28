import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { interop } from '../../framework.js';

import {
  INTEROP_SELFCARE_ONBOARDING_CONSUMER_ALARM_NAMES,
  INTEROP_SELFCARE_ONBOARDING_CONSUMER_RUNBOOK_KEY,
  INTEROP_SELFCARE_ONBOARDING_CONSUMER_SERVICE_NAME,
  resolveInteropSelfcareOnboardingConsumerAlarmContext,
} from '../resolveInteropAlarmContext.js';

describe('resolveInteropSelfcareOnboardingConsumerAlarmContext', () => {
  it('resolves every supported environment-specific alarm to the same canonical runbook key', () => {
    for (const alarmName of INTEROP_SELFCARE_ONBOARDING_CONSUMER_ALARM_NAMES) {
      const context = resolveInteropSelfcareOnboardingConsumerAlarmContext(alarmName);
      assert.strictEqual(context.alarmName, alarmName);
      assert.strictEqual(context.runbookKey, INTEROP_SELFCARE_ONBOARDING_CONSUMER_RUNBOOK_KEY);
      assert.strictEqual(context.logGroup, interop.k8s.buildInteropK8sApplicationLogGroup(context.environment));
      assert.strictEqual(context.podApp, INTEROP_SELFCARE_ONBOARDING_CONSUMER_SERVICE_NAME);
    }
  });

  it('rejects alarm names outside the declared INTEROP environments', () => {
    assert.throws(
      () =>
        resolveInteropSelfcareOnboardingConsumerAlarmContext('k8s-interop-be-selfcare-onboarding-consumer-errors-dev'),
      /Unsupported INTEROP alarm name/u,
    );
  });
});
