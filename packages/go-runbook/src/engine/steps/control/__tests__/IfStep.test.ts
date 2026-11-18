import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createTestContext } from '../../../../__tests__/helpers/createTestContext.js';
import { IfStep } from '../IfStep.js';

describe('IfStep', () => {
  const condition = { type: 'exists', ref: 'vars.traceId' } as const;
  const traced = createTestContext({ vars: { traceId: '1-abc' } });
  const untraced = createTestContext();

  it('jumps to the target of the branch the condition selects, and never fails', async () => {
    const step = new IfStep({ id: 'if', label: 'If', condition, thenGoTo: 'query', elseGoTo: 'stop' });

    const then = await step.execute(traced);
    assert.strictEqual(then.success, true);
    assert.deepStrictEqual(then.next, { goTo: 'query' });
    const otherwise = await step.execute(untraced);
    assert.strictEqual(otherwise.success, true);
    assert.deepStrictEqual(otherwise.next, { goTo: 'stop' });
  });

  it('continues when the selected branch declares no target', async () => {
    assert.strictEqual((await new IfStep({ id: 'if', label: 'If', condition }).execute(traced)).next, 'continue');
    assert.strictEqual((await new IfStep({ id: 'if', label: 'If', condition }).execute(untraced)).next, 'continue');
  });
});
