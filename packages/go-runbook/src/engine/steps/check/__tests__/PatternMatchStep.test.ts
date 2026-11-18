import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createTestContext } from '../../../../__tests__/helpers/createTestContext.js';
import { PatternMatchStep } from '../PatternMatchStep.js';

describe('PatternMatchStep', () => {
  const step = new PatternMatchStep({
    id: 'match-5xx',
    label: 'Status is 5xx',
    ref: 'vars.status',
    regex: '^5\\d\\d$',
  });

  const cases: ReadonlyArray<readonly [string, Readonly<Record<string, string>>, RegExp | undefined]> = [
    ['a matching value', { status: '502' }, undefined],
    ['a value that does not match', { status: '404' }, /"404" does not match/u],
    ['an unresolved reference', {}, /resolved to undefined/u],
  ];

  for (const [name, vars, error] of cases) {
    it(`${error === undefined ? 'succeeds' : 'fails'} on ${name}`, async () => {
      const result = await step.execute(createTestContext({ vars }));

      assert.strictEqual(result.success, error === undefined);
      assert.strictEqual(result.output, error === undefined);
      if (error !== undefined) assert.match(result.error ?? '', error);
    });
  }
});
