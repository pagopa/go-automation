import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOLogger } from '@pagopa/go-common/logging';

import { RunbookEngine } from '../RunbookEngine.js';
import { SetVarStep } from '../../steps/control/SetVarStep.js';
import { createTestWorkflowServices } from '../../testing/createTestWorkflowServices.js';
import type { Runbook } from '../../types/Runbook.js';

// EVO-RBREORG-OPUS-01 §6.1: the engine runs a complete runbook in memory with WorkflowServices only.
describe('RunbookEngine with WorkflowServices only', () => {
  it('runs the pipeline, matches a known case and returns the trace', async () => {
    const runbook: Runbook = {
      metadata: {
        id: 'in-memory',
        name: 'In memory',
        description: 'Engine without operational services',
        version: '1.0.0',
        type: 'alarm-resolution',
        team: 'GO',
        tags: [],
      },
      steps: [
        { step: new SetVarStep({ id: 'set-outcome', label: 'Set outcome', varName: 'outcome', value: 'known' }) },
      ],
      knownCases: [
        {
          id: 'known',
          description: 'Known outcome',
          priority: 1,
          condition: { type: 'compare', ref: 'vars.outcome', operator: '==', value: 'known' },
          action: { type: 'log', level: 'info', title: 'Known outcome' },
        },
      ],
      fallbackAction: { type: 'log', level: 'warn', title: 'Unknown outcome' },
    };

    const result = await new RunbookEngine(new GOLogger()).execute(runbook, new Map(), createTestWorkflowServices());

    assert.strictEqual(result.status, 'completed');
    assert.deepStrictEqual(
      result.matchedCases.map((knownCase) => knownCase.id),
      ['known'],
    );
    assert.strictEqual(result.finalContext.vars.get('outcome'), 'known');
  });
});
