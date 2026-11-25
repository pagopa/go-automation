import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isProfileValidationFailure,
  isProfileValidationSuccess,
  type AWSProfileValidationResult,
} from '../AWSProfileValidationResult.js';

describe('AWSProfileValidationResult', () => {
  it('tells successful and failed profile validations apart', () => {
    const success: AWSProfileValidationResult = { status: 'success', profile: 'profile-dev' };
    const failure: AWSProfileValidationResult = {
      status: 'failure',
      profile: 'profile-prod',
      error: new Error('SSO session expired'),
      isRecoverable: true,
    };

    assert.deepStrictEqual(
      [success, failure].map((result) => [isProfileValidationSuccess(result), isProfileValidationFailure(result)]),
      [
        [true, false],
        [false, true],
      ],
    );
  });
});
