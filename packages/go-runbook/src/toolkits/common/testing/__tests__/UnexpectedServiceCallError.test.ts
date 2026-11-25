import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { UnexpectedServiceCallError } from '../UnexpectedServiceCallError.js';

describe('UnexpectedServiceCallError', () => {
  it('names the unstubbed method', () => {
    const error = new UnexpectedServiceCallError('athena.query');

    assert.ok(error instanceof Error);
    assert.strictEqual(error.name, 'UnexpectedServiceCallError');
    assert.strictEqual(error.method, 'athena.query');
    assert.match(error.message, /athena\.query/u);
  });
});
