import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { service } from '../../framework.js';

import { buildK8sInteropPublicCatalogAstroFrontendErrorsRunbook } from '../runbook.js';
import {
  ANALYZE_INTEROP_APPLICATION_LOGS_STEP_ID,
  ANALYZE_INTEROP_CID_TRACKER_STEP_ID,
  QUERY_INTEROP_APPLICATION_LOGS_STEP_ID,
  QUERY_INTEROP_CID_TRACKER_STEP_ID,
  RESOLVE_INTEROP_ALARM_CONTEXT_STEP_ID,
} from '../runbookSteps.js';
import { INTEROP_PUBLIC_CATALOG_RUNBOOK_KEY } from '../resolveInteropAlarmContext.js';

describe('buildK8sInteropPublicCatalogAstroFrontendErrorsRunbook', () => {
  it('builds a SERVICE-compatible read-only runbook with the expected pipeline', () => {
    const runbook = buildK8sInteropPublicCatalogAstroFrontendErrorsRunbook();

    assert.strictEqual(runbook.metadata.id, INTEROP_PUBLIC_CATALOG_RUNBOOK_KEY);
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
    assert.strictEqual(runbook.runbookContext.service.name, 'interop-public-catalog-astro-frontend');
  });
});
