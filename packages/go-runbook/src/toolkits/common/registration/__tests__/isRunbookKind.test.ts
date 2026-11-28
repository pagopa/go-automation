import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isRunbookKind } from '../isRunbookKind.js';

describe('isRunbookKind', () => {
  it('accepts every runbook family and nothing else', () => {
    for (const kind of ['APIGW', 'LAMBDA', 'SERVICE', 'DOWNSTREAM', 'K8S'])
      assert.strictEqual(isRunbookKind(kind), true);
    for (const value of ['apigw', 'COMMON', '', undefined, 3]) assert.strictEqual(isRunbookKind(value), false);
  });
});
