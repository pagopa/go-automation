import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AWSTargetNotConfiguredError, isAWSTargetNotConfiguredError } from '../AWSTargetNotConfiguredError.js';

describe('isAWSTargetNotConfiguredError', () => {
  it('recognises its own errors by shape, not by prototype', () => {
    // The error crosses a package boundary before it is classified, so the guard
    // must not depend on both sides sharing one class identity.
    const structural = Object.assign(new Error('from another realm'), { code: 'AWS_REGION_NOT_CONFIGURED' });
    const own = new AWSTargetNotConfiguredError('AWS_ACCOUNT_NOT_CONFIGURED', 'no profile for the account');

    assert.ok(isAWSTargetNotConfiguredError(structural));
    assert.ok(isAWSTargetNotConfiguredError(own));
  });

  it('does not claim unrelated failures', () => {
    for (const value of [
      new Error('ExpiredToken'),
      Object.assign(new Error('other'), { code: 'ACCESS_DENIED' }),
      'AWS_ACCOUNT_NOT_CONFIGURED',
      undefined,
    ]) {
      assert.strictEqual(isAWSTargetNotConfiguredError(value), false, String(value));
    }
  });
});
