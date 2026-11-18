import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createTestContext } from '../../../../__tests__/helpers/createTestContext.js';
import type { TestContextOptions } from '../../../../__tests__/helpers/TestContextOptions.js';
import { ExistsStep } from '../ExistsStep.js';

describe('ExistsStep', () => {
  const cases: ReadonlyArray<readonly [string, string, TestContextOptions, RegExp | undefined]> = [
    ['a resolved var', 'vars.traceId', { vars: { traceId: '1-abc' } }, undefined],
    ['a resolved param', 'params.alarmName', { params: { alarmName: 'alarm' } }, undefined],
    ['a missing var', 'vars.traceId', {}, /is undefined/u],
    ['an empty string', 'vars.traceId', { vars: { traceId: '' } }, /is empty/u],
  ];

  for (const [name, ref, init, error] of cases) {
    it(`${error === undefined ? 'succeeds' : 'fails'} on ${name}`, async () => {
      const result = await new ExistsStep({ id: 'exists', label: 'Exists', ref }).execute(createTestContext(init));

      assert.strictEqual(result.success, error === undefined);
      assert.strictEqual(result.output, error === undefined);
      if (error !== undefined) assert.match(result.error ?? '', error);
    });
  }
});
