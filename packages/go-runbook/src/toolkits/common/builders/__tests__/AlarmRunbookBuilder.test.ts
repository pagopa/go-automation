import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { logAction } from '../../../../engine/actions/ActionFactories.js';
import type { Step } from '../../../../engine/types/Step.js';
import { AlarmRunbookBuilder } from '../AlarmRunbookBuilder.js';

const step: Step<void> = {
  id: 'read-only',
  label: 'Read only',
  kind: 'data',
  async execute() {
    await Promise.resolve();
    return { success: true };
  },
};

describe('AlarmRunbookBuilder', () => {
  it('persists an explicit read-only cloud execution policy', () => {
    const runbook = AlarmRunbookBuilder.create('test-runbook')
      .metadata({
        name: 'Test',
        description: 'Test runbook',
        version: '1.0.0',
        type: 'alarm-resolution',
        team: 'GO',
        tags: [],
      })
      .cloudExecutionPolicy({ sideEffects: 'NONE' })
      .step(step)
      .fallback(logAction({ level: 'info', title: 'done' }))
      .build();

    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
  });

  it('persists an asymmetric occurrence window', () => {
    const runbook = AlarmRunbookBuilder.create('test-runbook')
      .metadata({
        name: 'Test',
        description: 'Test runbook',
        version: '1.0.0',
        type: 'alarm-resolution',
        team: 'GO',
        tags: [],
      })
      .occurrenceTimeWindow({ beforeMinutes: 10, afterMinutes: 5 })
      .step(step)
      .fallback(logAction({ level: 'info', title: 'done' }))
      .build();

    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 10, afterMinutes: 5 });
  });

  it('rejects invalid occurrence-window padding', () => {
    const builder = AlarmRunbookBuilder.create('test-runbook')
      .metadata({
        name: 'Test',
        description: 'Test runbook',
        version: '1.0.0',
        type: 'alarm-resolution',
        team: 'GO',
        tags: [],
      })
      .occurrenceTimeWindow({ beforeMinutes: -1, afterMinutes: 5 })
      .step(step)
      .fallback(logAction({ level: 'info', title: 'done' }));

    assert.throws(() => builder.build(), /Invalid occurrenceTimeWindow\.beforeMinutes/);
  });

  it('writes evidence after silent and the operational fields after the engine fields, in their historical order', () => {
    const runbook = AlarmRunbookBuilder.create('test-runbook')
      .metadata({
        name: 'Test',
        description: 'Test runbook',
        version: '1.0.0',
        type: 'alarm-resolution',
        team: 'GO',
        tags: [],
      })
      .analysisDefaults({ runbookName: 'Test' })
      .cloudExecutionPolicy({ sideEffects: 'NONE' })
      .runbookContext({
        kind: 'service',
        product: 'SEND',
        service: { name: 's', logGroup: '/l', varPrefix: 's' },
        queryProfileId: 'p',
      })
      .occurrenceTimeWindow({ beforeMinutes: 1, afterMinutes: 2 })
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
