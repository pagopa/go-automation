import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { collectRunbookSteps } from '../collectRunbookSteps.js';
import { IfBranchStep } from '../../steps/control/IfBranchStep.js';
import { SetVarStep } from '../../steps/control/SetVarStep.js';
import { SwitchBranchStep } from '../../steps/control/SwitchBranchStep.js';
import type { Runbook } from '../../types/Runbook.js';

function setVar(id: string): SetVarStep {
  return new SetVarStep({ id, label: id, varName: id, value: 'x' });
}

describe('collectRunbookSteps', () => {
  it('visits the pipeline, nested sub-pipelines and the steps of every action, once each', () => {
    const shared = setVar('shared');
    // Safe: collectRunbookSteps reads only steps, known cases and the fallback.
    const runbook = {
      metadata: { id: 'rb' },
      steps: [
        { step: setVar('a') },
        {
          step: new IfBranchStep({
            id: 'if',
            label: 'if',
            condition: { type: 'exists', ref: 'vars.a' },
            thenSteps: [setVar('then')],
            elseSteps: [shared],
          }),
        },
        {
          step: new SwitchBranchStep({
            id: 'switch',
            label: 'switch',
            ref: 'vars.a',
            cases: new Map([['x', [setVar('case-x')]]]),
            defaultSteps: [shared],
          }),
        },
      ],
      knownCases: [
        {
          id: 'case',
          description: 'case',
          priority: 1,
          condition: { type: 'exists', ref: 'vars.a' },
          action: {
            type: 'composite',
            actions: [
              { type: 'log', level: 'info', title: 'log' },
              { type: 'update', step: setVar('in-case') },
            ],
          },
        },
      ],
      fallbackAction: { type: 'update', step: setVar('in-fallback') },
    } as unknown as Runbook;

    assert.deepStrictEqual(
      collectRunbookSteps(runbook).map((step) => step.id),
      ['a', 'if', 'then', 'shared', 'switch', 'case-x', 'in-case', 'in-fallback'],
    );
  });
});
