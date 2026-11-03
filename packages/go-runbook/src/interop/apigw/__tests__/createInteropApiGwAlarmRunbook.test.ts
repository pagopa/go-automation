import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createInteropApiGwAlarmRunbook, defaultInteropApiGwRunbookStepIds } from '../builders/index.js';
import { INTEROP_API_GW_5XX_SERVICE_ERRORS_PROFILE } from '../profiles/index.js';
import type { InteropApiGwAlarmConfig, InteropApiGwPipelineAnchor } from '../types/index.js';
import type { Step } from '../../../types/Step.js';

const CONFIG: InteropApiGwAlarmConfig = {
  id: 'interop-test-api',
  metadata: {
    name: 'interop-test-api',
    description: 'Test API',
    version: '1.0.0',
    type: 'alarm-resolution',
    team: 'GO',
    tags: [],
  },
  resolverId: 'test-api-context',
  resolveAlarmContext: (alarmName) => ({
    alarmName,
    runbookKey: 'interop-test-api',
    environment: 'prod',
    apiGwId: 'test-api',
    apiGwLogGroup: 'access-prod',
    applicationLogGroup: 'application-prod',
    podApp: 'test-service',
  }),
  queryProfile: INTEROP_API_GW_5XX_SERVICE_ERRORS_PROFILE,
  apiGw: { logGroupTemplate: 'access-<env>', profileId: 'test-api' },
  application: { serviceName: 'test-service', logGroupTemplate: 'application-<env>', varPrefix: 'testService' },
  knownCases: [],
};

const probe: Step = {
  id: 'probe',
  label: 'Probe',
  kind: 'transform',
  async execute() {
    await Promise.resolve();
    return { success: true };
  },
};

describe('createInteropApiGwAlarmRunbook hooks', () => {
  it('keeps the default seven-step pipeline when no diagnostic hook is declared', () => {
    const runbook = createInteropApiGwAlarmRunbook(CONFIG);
    assert.deepStrictEqual(
      runbook.steps.map(({ step }) => step.id),
      Object.values(defaultInteropApiGwRunbookStepIds('test-service')),
    );
  });

  it('runs diagnostics before the final CID analyzer even when that step is renamed', () => {
    const runbook = createInteropApiGwAlarmRunbook({
      ...CONFIG,
      stepIds: { analyzeCidTracker: 'renamed-final-analysis' },
      hooks: [{ at: 'before-cid-analysis', step: probe }],
      analysisDefaults: { links: [{ url: 'https://example.com/runbook', name: 'Source', type: 'CONFLUENCE' }] },
    });
    const ids = runbook.steps.map(({ step }) => step.id);
    assert.strictEqual(ids[ids.indexOf('renamed-final-analysis') - 1], 'probe');
    assert.strictEqual(runbook.analysisDefaults?.links?.[0]?.name, 'Source');
    assert.deepStrictEqual(runbook.analysisDefaults?.resources, [{ name: 'test-service', role: 'PRIMARY' }]);
  });

  it('rejects a diagnostic hook targeting an anchor the pipeline never reaches', () => {
    assert.throws(
      () =>
        createInteropApiGwAlarmRunbook({
          ...CONFIG,
          hooks: [{ at: 'missing-anchor' as InteropApiGwPipelineAnchor, step: probe }],
        }),
      /hooks target anchors.*missing-anchor/u,
    );
  });
});
