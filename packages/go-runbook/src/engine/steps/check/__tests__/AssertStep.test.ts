import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createTestContext } from '../../../../__tests__/helpers/createTestContext.js';
import { AssertStep } from '../AssertStep.js';

describe('AssertStep', () => {
  const step = new AssertStep({
    id: 'assert-5xx',
    label: 'Traced 5xx',
    condition: {
      type: 'and',
      conditions: [
        { type: 'exists', ref: 'vars.traceId' },
        { type: 'pattern', ref: 'vars.status', regex: '^5\\d\\d$' },
      ],
    },
  });

  it('passes when the condition holds', async () => {
    const result = await step.execute(createTestContext({ vars: { traceId: '1-a', status: '503' } }));

    assert.deepStrictEqual([result.success, result.output], [true, true]);
  });

  it('fails with a message naming the step when the condition does not hold', async () => {
    const result = await step.execute(createTestContext({ vars: { status: '503' } }));

    assert.deepStrictEqual([result.success, result.output], [false, false]);
    assert.match(result.error ?? '', /Assertion failed for step "assert-5xx"/u);
  });
});
