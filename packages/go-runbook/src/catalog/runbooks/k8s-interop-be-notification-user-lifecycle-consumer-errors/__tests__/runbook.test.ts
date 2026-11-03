import { NOTIFICATION_USER_LIFECYCLE_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { service } from '../../framework.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { NOTIFICATION_USER_LIFECYCLE_QUERY_PROFILE as PROFILE } from '../queryProfile.js';

import { buildRunbook } from '../runbook.js';

describe('buildRunbook', () => {
  it('builds a SERVICE-compatible read-only runbook with the expected pipeline', () => {
    const runbook = buildRunbook();

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
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.strictEqual(runbook.analysisDefaults?.runbookName, NOTIFICATION_USER_LIFECYCLE_ALARM.runbookKey);
    assert.match(runbook.analysisDefaults?.links?.[0]?.url ?? '', /2659549286/u);
  });

  it('matches the structured log predicate and the exact pod app, preserving the CID date order', () => {
    const query = PROFILE.buildApplicationLogsQuery(NOTIFICATION_USER_LIFECYCLE_ALARM.podApp);
    assert.match(query, /filter \(log like \/ERROR\/ or stream = "stderr"\)/u);
    assert.doesNotMatch(query, /@message like \/ERROR\//u);
    assert.match(query, /pod_app = "interop-be-notification-user-lifecycle-consumer"/u);
    assert.doesNotMatch(query, /pod_app like/u);
    const tracker = PROFILE.buildCidTrackerQuery('user-lifecycle-cid');
    assert.match(tracker, /filter cid = "user-lifecycle-cid"/u);
    assert.match(tracker, /parse log \/\(\?<date>/u);
    assert.match(tracker, /sort date asc/u);
  });
});
