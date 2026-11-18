import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createTestContext } from '../../../../__tests__/helpers/createTestContext.js';
import type { TestContextOptions } from '../../../../__tests__/helpers/TestContextOptions.js';
import type { Step } from '../../../types/Step.js';
import { SetVarStep } from '../SetVarStep.js';
import { SwitchBranchStep } from '../SwitchBranchStep.js';

function setAction(value: string): SetVarStep {
  return new SetVarStep({ id: `set-${value}`, label: value, varName: 'action', value });
}

function switchOn(ref: string, withDefault: boolean): SwitchBranchStep {
  return new SwitchBranchStep({
    id: 'switch',
    label: 'Switch',
    ref,
    cases: new Map<string, ReadonlyArray<Step>>([
      ['timeout', [setAction('retry')]],
      ['not-found', [setAction('skip')]],
    ]),
    ...(withDefault ? { defaultSteps: [setAction('escalate')] } : {}),
  });
}

describe('SwitchBranchStep', () => {
  const cases: ReadonlyArray<readonly [string, string, boolean, TestContextOptions, string | undefined]> = [
    ['runs the matching case', 'vars.errorType', true, { vars: { errorType: 'timeout' } }, 'retry'],
    ['resolves params as well as vars', 'params.errorType', false, { params: { errorType: 'not-found' } }, 'skip'],
    [
      'falls back to the default when no case matches',
      'vars.errorType',
      true,
      { vars: { errorType: 'x' } },
      'escalate',
    ],
    ['falls back to the default when the ref does not resolve', 'vars.errorType', true, {}, 'escalate'],
    [
      'treats a ref without a namespace as unresolved',
      'errorType',
      true,
      { vars: { errorType: 'timeout' } },
      'escalate',
    ],
    ['returns no vars without a match or a default', 'vars.errorType', false, { vars: { errorType: 'x' } }, undefined],
  ];

  for (const [name, ref, withDefault, init, action] of cases) {
    it(name, async () => {
      const result = await switchOn(ref, withDefault).execute(createTestContext(init));

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.vars, action === undefined ? undefined : { action });
    });
  }

  it('leaves the parent context untouched: sub-steps write into a child copy', async () => {
    const context = createTestContext({ vars: { errorType: 'timeout' } });

    await switchOn('vars.errorType', false).execute(context);

    assert.strictEqual(context.vars.has('action'), false);
  });
});
