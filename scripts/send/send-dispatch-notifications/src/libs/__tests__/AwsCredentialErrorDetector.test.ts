import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AwsCredentialErrorDetector } from '../AwsCredentialErrorDetector.js';

/** SDK-style error: the service names the failure, the message rarely repeats it. */
function sdkError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe('AwsCredentialErrorDetector', () => {
  const { isCredentialError } = new AwsCredentialErrorDetector();

  it('recognizes expired or rejected credentials by the error name, an expired SSO session by the message', () => {
    const expired = 'The security token included in the request is expired';
    for (const error of [
      sdkError('ExpiredTokenException', expired),
      sdkError('ExpiredToken', expired),
      sdkError('UnrecognizedClientException', 'The security token included in the request is invalid.'),
      sdkError('InvalidSignatureException', 'Signature expired'),
      new Error('The SSO session associated with this profile has expired or is otherwise invalid.'),
    ]) {
      assert.equal(isCredentialError(error), true, error.name);
    }
  });

  it('leaves other query errors to the retry', () => {
    for (const error of [
      sdkError('ProvisionedThroughputExceededException', 'throttled'),
      sdkError('ResourceNotFoundException', 'Requested resource not found'),
      'not even an error',
    ]) {
      assert.equal(isCredentialError(error), false);
    }
  });
});
