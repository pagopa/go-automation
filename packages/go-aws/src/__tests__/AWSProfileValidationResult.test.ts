import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isProfileValidationFailure,
  isProfileValidationSuccess,
  type AWSProfileValidationResult,
} from '../AWSProfileValidationResult.js';

describe('AWSProfileValidationResult', () => {
  it('identifies successful profile validation results', () => {
    const result: AWSProfileValidationResult = {
      status: 'success',
      profile: 'sso-dev',
      accountId: '123456789012',
    };

    assert.strictEqual(isProfileValidationSuccess(result), true);
    assert.strictEqual(isProfileValidationFailure(result), false);
  });

  it('identifies failed profile validation results', () => {
    const error = new Error('SSO session expired');
    const result: AWSProfileValidationResult = {
      status: 'failure',
      profile: 'sso-prod',
      error,
      isRecoverable: true,
    };

    assert.strictEqual(isProfileValidationSuccess(result), false);
    assert.strictEqual(isProfileValidationFailure(result), true);
  });
});
