import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { service } from '@go-automation/go-runbook';

import { buildK8sInteropBeBackendForFrontendErrorsRunbook } from '../runbook.js';
import {
  ANALYZE_INTEROP_APPLICATION_LOGS_STEP_ID,
  ANALYZE_INTEROP_CID_TRACKER_STEP_ID,
  QUERY_INTEROP_APPLICATION_LOGS_STEP_ID,
  QUERY_INTEROP_CID_TRACKER_STEP_ID,
  RESOLVE_INTEROP_ALARM_CONTEXT_STEP_ID,
} from '../runbookSteps.js';
import { INTEROP_BFF_RUNBOOK_KEY } from '../resolveInteropAlarmContext.js';

describe('buildK8sInteropBeBackendForFrontendErrorsRunbook', () => {
  it('builds a SERVICE-compatible read-only runbook with the expected pipeline', () => {
    const runbook = buildK8sInteropBeBackendForFrontendErrorsRunbook();

    assert.strictEqual(runbook.metadata.id, INTEROP_BFF_RUNBOOK_KEY);
    assert.deepStrictEqual(
      runbook.steps.map((descriptor) => descriptor.step.id),
      [
        RESOLVE_INTEROP_ALARM_CONTEXT_STEP_ID,
        QUERY_INTEROP_APPLICATION_LOGS_STEP_ID,
        ANALYZE_INTEROP_APPLICATION_LOGS_STEP_ID,
        QUERY_INTEROP_CID_TRACKER_STEP_ID,
        ANALYZE_INTEROP_CID_TRACKER_STEP_ID,
      ],
    );
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.ok(service.isServiceRunbookContext(runbook.runbookContext));
    assert.strictEqual(runbook.runbookContext.service.name, 'interop-be-backend-for-frontend');
  });
});
