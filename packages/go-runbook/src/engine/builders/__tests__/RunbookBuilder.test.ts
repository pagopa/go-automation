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
  it('builds only the engine fields, and copies only the engine options of a step', () => {
    const runbook = RunbookBuilder.create('test-runbook')
      .metadata({
        name: 'Test',
        description: 'Test runbook',
        version: '1.0.0',
        type: 'alarm-resolution',
        team: 'GO',
        tags: [],
      })
      .step(step, { continueOnFailure: true, silent: true })
      .fallback(logAction({ level: 'info', title: 'done' }))
      .build();

    assert.deepStrictEqual(Object.keys(runbook), ['metadata', 'steps', 'knownCases', 'fallbackAction']);
    assert.deepStrictEqual(runbook.steps[0], { step, continueOnFailure: true, silent: true });
  });

  it('reports missing metadata and fallback with engine codes', () => {
    const builder = RunbookBuilder.create('test-runbook').step(step);

    assert.deepStrictEqual(
      builder.validate().map((error) => error.code),
      ['MISSING_METADATA', 'MISSING_FALLBACK'],
    );
  });
});
