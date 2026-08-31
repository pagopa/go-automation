import { PUBLIC_CATALOG_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { service } from '../../framework.js';

import { buildK8sInteropPublicCatalogAstroFrontendErrorsRunbook } from '../runbook.js';

describe('buildK8sInteropPublicCatalogAstroFrontendErrorsRunbook', () => {
  it('builds a SERVICE-compatible read-only runbook with the expected pipeline', () => {
    const runbook = buildK8sInteropPublicCatalogAstroFrontendErrorsRunbook();

    assert.strictEqual(runbook.metadata.id, PUBLIC_CATALOG_ALARM.runbookKey);
    assert.deepStrictEqual(
      runbook.steps.map((descriptor) => descriptor.step.id),
      [
        PUBLIC_CATALOG_ALARM.stepIds.resolveContext,
        PUBLIC_CATALOG_ALARM.stepIds.queryApplicationLogs,
        PUBLIC_CATALOG_ALARM.stepIds.analyzeApplicationLogs,
        PUBLIC_CATALOG_ALARM.stepIds.queryCidTracker,
        PUBLIC_CATALOG_ALARM.stepIds.analyzeCidTracker,
      ],
    );
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.ok(service.isServiceRunbookContext(runbook.runbookContext));
    assert.strictEqual(runbook.runbookContext.service.name, 'interop-public-catalog-astro-frontend');
  });
});
