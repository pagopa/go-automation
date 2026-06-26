import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { logAction } from '../../actions/ActionFactories.js';
import type { Step } from '../../types/Step.js';
import { RunbookBuilder } from '../RunbookBuilder.js';

const step: Step<void> = {
  id: 'read-only',
  label: 'Read only',
  kind: 'data',
  async execute() {
    await Promise.resolve();
    return { success: true };
  },
};

describe('RunbookBuilder', () => {
  it('persists an explicit read-only cloud execution policy', () => {
    const runbook = RunbookBuilder.create('test-runbook')
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
      .fallback(logAction({ level: 'info', message: 'done' }))
      .build();

    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
  });
});
