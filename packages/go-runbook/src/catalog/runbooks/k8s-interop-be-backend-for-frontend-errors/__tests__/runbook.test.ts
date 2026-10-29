import { BFF_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { service } from '../../framework.js';
import { BFF_EVIDENCE_STEP_ID } from '../AnalyzeBffEvidenceStep.js';
import { BFF_QUERY_PROFILE } from '../queryProfile.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { resolveOccurrenceTimeWindow } from '../../../computeRunbookTimeRange.js';

import { buildRunbook } from '../runbook.js';

describe('buildRunbook', () => {
  it('builds a SERVICE-compatible read-only runbook with the expected pipeline', () => {
    const runbook = buildRunbook();

    assert.strictEqual(runbook.metadata.id, BFF_ALARM.runbookKey);
    assert.deepStrictEqual(
      runbook.steps.map((descriptor) => descriptor.step.id),
      [
        BFF_ALARM.stepIds.resolveContext,
        BFF_ALARM.stepIds.queryApplicationLogs,
        BFF_ALARM.stepIds.analyzeApplicationLogs,
        BFF_ALARM.stepIds.queryCidTracker,
        BFF_EVIDENCE_STEP_ID,
        BFF_ALARM.stepIds.analyzeCidTracker,
      ],
    );
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.deepStrictEqual(resolveOccurrenceTimeWindow(runbook), { beforeMinutes: 5, afterMinutes: 5 });
    assert.ok(runbook.analysisDefaults?.links?.[0]?.url.includes('/2585559041/'));
    assert.ok(service.isServiceRunbookContext(runbook.runbookContext));
    assert.strictEqual(runbook.runbookContext.service.name, 'interop-be-backend-for-frontend');
  });

  it('selects the structured application error field and exact BFF service while retaining stderr', () => {
    const query = BFF_QUERY_PROFILE.buildApplicationLogsQuery(BFF_ALARM.podApp);
    assert.match(query, /filter \(log like \/ERROR\/ or stream = "stderr"\)/u);
    assert.match(query, /pod_app = "interop-be-backend-for-frontend"/u);
    assert.doesNotMatch(query, /@message like \/ERROR\/|pod_app like/u);
  });
});
