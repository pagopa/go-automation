import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createTestContext } from '../../../../__tests__/helpers/createTestContext.js';
import type { TestContextOptions } from '../../../../__tests__/helpers/TestContextOptions.js';
import { CompareStep } from '../CompareStep.js';

describe('CompareStep', () => {
  const cases: ReadonlyArray<
    readonly [string, string, '>' | '==' | '>=', string | number, TestContextOptions, RegExp | undefined]
  > = [
    ['a satisfied comparison', 'vars.count', '>', 5, { vars: { count: '10' } }, undefined],
    [
      'an unsatisfied comparison',
      'params.status',
      '==',
      '200',
      { params: { status: '500' } },
      /"500" == "200" is false/,
    ],
    [
      'an unresolved reference',
      'steps.query.output.count',
      '>=',
      1,
      {},
      /reference "steps\.query\.output\.count" resolved to undefined/,
    ],
  ];

  for (const [name, leftRef, operator, rightValue, init, error] of cases) {
    it(`${error === undefined ? 'succeeds' : 'fails'} on ${name}`, async () => {
      const step = new CompareStep({ id: 'compare', label: 'Compare', leftRef, operator, rightValue });

      const result = await step.execute(createTestContext(init));

      assert.strictEqual(result.success, error === undefined);
      assert.strictEqual(result.output, error === undefined);
      if (error !== undefined) assert.match(result.error ?? '', error);
    });
  }
});
