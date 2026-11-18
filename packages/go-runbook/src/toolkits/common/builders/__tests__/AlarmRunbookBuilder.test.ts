import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { logAction } from '../../../../engine/actions/ActionFactories.js';
import type { Step } from '../../../../engine/types/Step.js';
import { AlarmRunbookBuilder } from '../AlarmRunbookBuilder.js';
import { TEST_RUNBOOK_METADATA } from '../../../../__tests__/helpers/TEST_RUNBOOK_METADATA.js';

const step: Step<void> = {
  id: 'read-only',
  label: 'Read only',
  kind: 'data',
  async execute() {
    await Promise.resolve();
    return { success: true };
  },
};

function builder(): AlarmRunbookBuilder {
  return AlarmRunbookBuilder.create('test-runbook').metadata(TEST_RUNBOOK_METADATA);
}

describe('AlarmRunbookBuilder', () => {
  it('rejects invalid occurrence-window padding', () => {
    const invalid = builder()
      .occurrenceTimeWindow({ beforeMinutes: -1, afterMinutes: 5 })
      .step(step)
      .fallback(logAction({ level: 'info', title: 'done' }));

    assert.throws(() => invalid.build(), /Invalid occurrenceTimeWindow\.beforeMinutes/);
  });

  it('persists the operational fields after the engine fields, and evidence after silent, in their historical order', () => {
    const runbook = builder()
      .analysisDefaults({ runbookName: 'Test' })
      .cloudExecutionPolicy({ sideEffects: 'NONE' })
      .runbookContext({
        kind: 'service',
        product: 'SEND',
        service: { name: 's', logGroup: '/l', varPrefix: 's' },
        queryProfileId: 'p',
      })
      .occurrenceTimeWindow({ beforeMinutes: 10, afterMinutes: 5 })
      .step(step, {
        silent: true,
        evidence: [
          {
            id: 'e',
            label: 'E',
            type: 'log-sample',
            retention: { mode: 'latest', limit: 1, timestampField: '@timestamp' },
          },
        ],
      })
      .maxIterations(5)
      .fallback(logAction({ level: 'info', title: 'done' }))
      .build();

    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 10, afterMinutes: 5 });
    assert.deepStrictEqual(Object.keys(runbook.steps[0] ?? {}), ['step', 'silent', 'evidence']);
    assert.deepStrictEqual(Object.keys(runbook), [
      'metadata',
      'steps',
      'knownCases',
      'fallbackAction',
      'occurrenceTimeWindow',
      'runbookContext',
      'cloudExecutionPolicy',
      'analysisDefaults',
      'maxIterations',
    ]);
  });
});
