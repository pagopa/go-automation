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

  it('recognizes an expired security token by the error name, whatever the message', () => {
    const message = 'The security token included in the request is expired';
    assert.equal(isCredentialError(sdkError('ExpiredTokenException', message)), true);
    assert.equal(isCredentialError(sdkError('ExpiredToken', message)), true);
  });

  it('recognizes credentials rejected by the service', () => {
    assert.equal(
      isCredentialError(
        sdkError('UnrecognizedClientException', 'The security token included in the request is invalid.'),
      ),
      true,
    );
    assert.equal(isCredentialError(sdkError('InvalidSignatureException', 'Signature expired')), true);
  });

  it('recognizes an expired SSO session from the message (go-common analysis)', () => {
    assert.equal(
      isCredentialError(new Error('The SSO session associated with this profile has expired or is otherwise invalid.')),
      true,
    );
  });

  it('leaves other query errors to the retry', () => {
    assert.equal(isCredentialError(sdkError('ProvisionedThroughputExceededException', 'throttled')), false);
    assert.equal(isCredentialError(sdkError('ResourceNotFoundException', 'Requested resource not found')), false);
    assert.equal(isCredentialError('not even an error'), false);
  });
});
