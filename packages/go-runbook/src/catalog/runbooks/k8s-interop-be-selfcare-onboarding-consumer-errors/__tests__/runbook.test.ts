import { SELFCARE_ONBOARDING_CONSUMER_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { service } from '../../framework.js';
import { SELFCARE_ONBOARDING_QUERY_PROFILE } from '../queryProfile.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';

import { buildRunbook } from '../runbook.js';

describe('buildRunbook', () => {
  it('builds a SERVICE-compatible read-only runbook with the expected pipeline', () => {
    const runbook = buildRunbook();

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
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 5, afterMinutes: 1 });
    assert.ok(service.isServiceRunbookContext(runbook.runbookContext));
    assert.strictEqual(runbook.runbookContext.service.name, SELFCARE_ONBOARDING_CONSUMER_ALARM.podApp);
    assert.ok(runbook.analysisDefaults?.links?.[0]?.url.includes('/2145419266/'));
  });

  it('queries ERROR in log or stderr for the exact onboarding service', () => {
    const query = SELFCARE_ONBOARDING_QUERY_PROFILE.buildApplicationLogsQuery(
      SELFCARE_ONBOARDING_CONSUMER_ALARM.podApp,
    );
    assert.match(query, /filter \(log like \/ERROR\/ or stream = "stderr"\)/u);
    assert.match(query, /pod_app = "interop-be-selfcare-onboarding-consumer"/u);
    assert.doesNotMatch(query, /@message like \/ERROR\/|pod_app like/u);
  });
});
