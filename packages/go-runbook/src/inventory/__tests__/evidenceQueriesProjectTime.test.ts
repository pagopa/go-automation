import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { collectRunbookSteps } from '../../engine/core/collectRunbookSteps.js';
import { collectConditionStepRefs } from '../../engine/validation/collectConditionStepRefs.js';
import { createTestContext } from '../../__tests__/helpers/createTestContext.js';
import { INVENTORY_MANIFEST } from '../manifest.js';

/** A query that chooses its columns (`display`, `fields`, `stats`); without one Logs Insights returns the time. */
const PROJECTING = /\|\s*(?:display|fields|stats)\b/iu;

describe('evidence queries of the catalog', () => {
  it('project the time of every row a known case reads', () => {
    const context = createTestContext({
      params: { startTime: '2026-01-01T00:00:00.000Z', endTime: '2026-01-01T00:10:00.000Z' },
      services: { cloudWatchLogs: { getConfiguredSources: () => [] } },
    });
    const missing: string[] = [];
    let checked = 0;
    for (const registration of INVENTORY_MANIFEST) {
      const runbook = registration.build();
      const read = new Set(
        runbook.knownCases.flatMap((knownCase) => [...collectConditionStepRefs(knownCase.condition)]),
      );
      for (const step of collectRunbookSteps(runbook)) {
        if (!read.has(step.id)) continue;
        const query = step.getTraceInfo?.(context)['query'];
        if (typeof query !== 'string') continue;
        checked += 1;
        if (PROJECTING.test(query) && !query.includes('@timestamp')) missing.push(`${runbook.metadata.id}: ${step.id}`);
      }
    }
    assert.ok(checked > 0);
    assert.deepStrictEqual(missing, []);
  });
});
