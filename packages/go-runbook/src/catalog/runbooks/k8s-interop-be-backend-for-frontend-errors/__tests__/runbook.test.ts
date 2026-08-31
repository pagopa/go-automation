import { BFF_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { service } from '../../framework.js';

import { buildK8sInteropBeBackendForFrontendErrorsRunbook } from '../runbook.js';

describe('buildK8sInteropBeBackendForFrontendErrorsRunbook', () => {
  it('builds a SERVICE-compatible read-only runbook with the expected pipeline', () => {
    const runbook = buildK8sInteropBeBackendForFrontendErrorsRunbook();

    assert.strictEqual(runbook.metadata.id, BFF_ALARM.runbookKey);
    assert.deepStrictEqual(
      runbook.steps.map((descriptor) => descriptor.step.id),
      [
        BFF_ALARM.stepIds.resolveContext,
        BFF_ALARM.stepIds.queryApplicationLogs,
        BFF_ALARM.stepIds.analyzeApplicationLogs,
        BFF_ALARM.stepIds.queryCidTracker,
        BFF_ALARM.stepIds.analyzeCidTracker,
      ],
    );
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.ok(service.isServiceRunbookContext(runbook.runbookContext));
    assert.strictEqual(runbook.runbookContext.service.name, 'interop-be-backend-for-frontend');
  });
});
