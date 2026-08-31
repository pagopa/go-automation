import { SELFCARE_ONBOARDING_CONSUMER_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { service } from '../../framework.js';

import { buildK8sInteropBeSelfcareOnboardingConsumerErrorsRunbook } from '../runbook.js';

describe('buildK8sInteropBeSelfcareOnboardingConsumerErrorsRunbook', () => {
  it('builds a SERVICE-compatible read-only runbook with the expected pipeline', () => {
    const runbook = buildK8sInteropBeSelfcareOnboardingConsumerErrorsRunbook();

    assert.strictEqual(runbook.metadata.id, SELFCARE_ONBOARDING_CONSUMER_ALARM.runbookKey);
    assert.deepStrictEqual(
      runbook.steps.map((descriptor) => descriptor.step.id),
      [
        SELFCARE_ONBOARDING_CONSUMER_ALARM.stepIds.resolveContext,
        SELFCARE_ONBOARDING_CONSUMER_ALARM.stepIds.queryApplicationLogs,
        SELFCARE_ONBOARDING_CONSUMER_ALARM.stepIds.analyzeApplicationLogs,
        SELFCARE_ONBOARDING_CONSUMER_ALARM.stepIds.queryCidTracker,
        SELFCARE_ONBOARDING_CONSUMER_ALARM.stepIds.analyzeCidTracker,
      ],
    );
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 5, afterMinutes: 1 });
    assert.ok(service.isServiceRunbookContext(runbook.runbookContext));
    assert.strictEqual(runbook.runbookContext.service.name, SELFCARE_ONBOARDING_CONSUMER_ALARM.podApp);
  });
});
