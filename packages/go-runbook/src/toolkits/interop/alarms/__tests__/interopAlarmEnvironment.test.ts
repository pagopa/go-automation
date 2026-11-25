import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { interopAlarmEnvironment } from '../interopAlarmEnvironment.js';

describe('interopAlarmEnvironment', () => {
  it('resolves an alarm to its environment by exact name and lists the others, sorted, otherwise', () => {
    const environmentOf = interopAlarmEnvironment([
      ['x-test', 'test'],
      ['x-prod', 'prod'],
    ]);
    assert.strictEqual(environmentOf('x-prod'), 'prod');
    assert.strictEqual(environmentOf('x-test'), 'test');
    assert.throws(
      () => environmentOf('x-prod-2'),
      /Unsupported INTEROP alarm name "x-prod-2"\. Expected one of: x-prod, x-test/u,
    );
  });
});
