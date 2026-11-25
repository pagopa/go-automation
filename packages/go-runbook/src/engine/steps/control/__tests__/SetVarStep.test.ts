import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createTestContext } from '../../../../__tests__/helpers/createTestContext.js';
import { SetVarStep } from '../SetVarStep.js';

describe('SetVarStep', () => {
  const context = createTestContext({ vars: { service: 'pn-delivery' }, params: { alarmName: 'B2B' } });
  const cases: ReadonlyArray<readonly [string, { readonly value?: string; readonly expression?: string }, string]> = [
    ['writes the literal value', { value: 'prod' }, 'prod'],
    ['interpolates an expression', { expression: '{{params.alarmName}}/{{vars.service}}' }, 'B2B/pn-delivery'],
    ['prefers the literal value over the expression', { value: 'prod', expression: '{{vars.service}}' }, 'prod'],
    ['writes an empty string when neither is configured', {}, ''],
  ];

  for (const [name, source, expected] of cases) {
    it(name, async () => {
      const result = await new SetVarStep({ id: 'set', label: 'Set', varName: 'out', ...source }).execute(context);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.vars, { out: expected });
    });
  }
});
