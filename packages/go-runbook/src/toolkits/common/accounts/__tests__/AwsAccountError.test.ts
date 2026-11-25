import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AwsAccountError, isAwsAccountError } from '../AwsAccountError.js';

describe('AwsAccountError', () => {
  it('carries a stable code and is recognised by the guard', () => {
    const error = new AwsAccountError('AWS_ACCOUNT_NOT_CONFIGURED', 'missing entry');
    assert.equal(error.code, 'AWS_ACCOUNT_NOT_CONFIGURED');
    assert.equal(error.name, 'AwsAccountError');
    assert.ok(error instanceof Error);
    assert.equal(isAwsAccountError(error), true);
  });

  it('recognises a copy from another module instance by name and code, and nothing else', () => {
    const copy = Object.assign(new Error('x'), { name: 'AwsAccountError', code: 'AWS_ACCOUNT_UNREACHABLE' });
    assert.equal(isAwsAccountError(copy), true);
    assert.equal(isAwsAccountError(new Error('x')), false);
    assert.equal(isAwsAccountError('AwsAccountError'), false);
  });
});
