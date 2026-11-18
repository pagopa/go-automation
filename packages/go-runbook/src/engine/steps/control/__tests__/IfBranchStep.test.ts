import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createTestContext } from '../../../../__tests__/helpers/createTestContext.js';
import type { Step } from '../../../types/Step.js';
import { SetVarStep } from '../SetVarStep.js';
import { IfBranchStep } from '../IfBranchStep.js';

function setVar(varName: string, value: string): SetVarStep {
  return new SetVarStep({ id: `set-${varName}-${value}`, label: varName, varName, value });
}

const CONDITION = { type: 'compare', ref: 'vars.errorType', operator: '==', value: 'timeout' } as const;
const TIMEOUT = { vars: { errorType: 'timeout' } };
const NOT_FOUND = { vars: { errorType: 'not-found' } };

function branch(thenSteps: ReadonlyArray<Step>, elseSteps?: ReadonlyArray<Step>): IfBranchStep {
  return new IfBranchStep({
    id: 'branch',
    label: 'Branch',
    condition: CONDITION,
    thenSteps,
    ...(elseSteps === undefined ? {} : { elseSteps }),
  });
}

describe('IfBranchStep', () => {
  it('runs the pipeline the condition selects, in order, and returns the vars it produced', async () => {
    const step = branch([setVar('first', '1'), setVar('second', '2'), setVar('first', '3')], [setVar('retry', 'no')]);

    const then = await step.execute(createTestContext(TIMEOUT));
    assert.strictEqual(then.success, true);
    assert.deepStrictEqual(then.vars, { first: '3', second: '2' });
    assert.deepStrictEqual((await step.execute(createTestContext(NOT_FOUND))).vars, { retry: 'no' });
  });

  it('succeeds without vars when the selected branch is empty or absent', async () => {
    for (const [step, init] of [
      [branch([]), TIMEOUT],
      [branch([setVar('retry', 'yes')]), NOT_FOUND],
    ] as const) {
      const result = await step.execute(createTestContext(init));
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.vars, undefined);
    }
  });

  it('reports which sub-step failed', async () => {
    const failing: Step = {
      id: 'boom',
      label: 'Boom',
      kind: 'control',
      execute: async () => {
        await Promise.resolve();
        return { success: false, error: 'downstream unavailable' };
      },
    };

    const result = await branch([failing]).execute(createTestContext(TIMEOUT));

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /Sub-step 'boom' failed: downstream unavailable/u);
  });

  it('leaves the parent context untouched: sub-steps write into a child copy', async () => {
    const context = createTestContext(TIMEOUT);

    await branch([setVar('retry', 'yes')]).execute(context);

    assert.strictEqual(context.vars.has('retry'), false);
  });
});
