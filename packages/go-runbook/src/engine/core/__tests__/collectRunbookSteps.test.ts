import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { collectRunbookSteps } from '../collectRunbookSteps.js';
import { SetVarStep } from '../../steps/control/SetVarStep.js';
import type { Runbook } from '../../types/Runbook.js';

function setVar(id: string): SetVarStep {
  return new SetVarStep({ id, label: id, varName: id, value: 'x' });
}

describe('collectRunbookSteps', () => {
  it('visits the pipeline and the steps of every action, once each', () => {
    const shared = setVar('shared');
    // Safe: collectRunbookSteps reads only steps, known errors and the fallback.
    const runbook = {
      metadata: { id: 'rb' },
      steps: [{ step: setVar('a') }, { step: shared }],
      knownErrors: [
        {
          id: 'case',
          description: 'case',
          condition: { type: 'exists', ref: 'vars.a' },
          action: {
            type: 'composite',
            actions: [
              { type: 'log', level: 'info', title: 'log' },
              { type: 'update', step: setVar('in-case') },
              { type: 'update', step: shared },
            ],
          },
        },
      ],
      fallbackAction: { type: 'update', step: setVar('in-fallback') },
    } as unknown as Runbook;

    assert.deepStrictEqual(
      collectRunbookSteps(runbook).map((step) => step.id),
      ['a', 'shared', 'in-case', 'in-fallback'],
    );
  });
});
