import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AWSTargetNotConfiguredError, isAWSTargetNotConfiguredError } from '../AWSTargetNotConfiguredError.js';

describe('AWSTargetNotConfiguredError', () => {
  it('carries the reason as a code, so consumers do not read the message', () => {
    const error = new AWSTargetNotConfiguredError('AWS_ACCOUNT_NOT_CONFIGURED', 'no profile for 222222222222');

    assert.strictEqual(error.code, 'AWS_ACCOUNT_NOT_CONFIGURED');
    assert.strictEqual(error.name, 'AWSTargetNotConfiguredError');
    assert.ok(error instanceof Error);
  });

  it('recognises its own errors by shape, not by prototype', () => {
    // The error crosses a package boundary before it is classified, so the guard
    // must not depend on both sides sharing one class identity.
    const structural = Object.assign(new Error('from another realm'), { code: 'AWS_REGION_NOT_CONFIGURED' });

    assert.ok(isAWSTargetNotConfiguredError(structural));
    assert.ok(isAWSTargetNotConfiguredError(new AWSTargetNotConfiguredError('AWS_REGION_NOT_CONFIGURED', 'x')));
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
