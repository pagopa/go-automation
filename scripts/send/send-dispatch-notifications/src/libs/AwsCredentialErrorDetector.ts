/**
 * Recognition of expired or rejected AWS credentials during the requestId
 * phase (§8.3).
 */

import { AWS } from '@go-automation/go-common';

/**
 * SDK error names of credentials rejected by the service, or expired by the
 * time the request reached it. Matched by name: the go-common analysis reads
 * the message only, and the expired-token message (`The security token
 * included in the request is expired`) names no token.
 */
const REJECTED_CREDENTIALS: ReadonlySet<string> = new Set([
  'UnrecognizedClientException',
  'InvalidSignatureException',
  'ExpiredTokenException',
  'ExpiredToken',
]);

/**
 * Tells whether a timeline query failed because the AWS credentials expired
 * or were rejected: SSO session expired/invalid and credential provider
 * failures (go-common analysis), or credentials refused or expired per
 * DynamoDB.
 *
 * Created once per run (the go-common analyzer is reused for every failed
 * query) and passed to the session as `isCredentialError`.
 */
export class AwsCredentialErrorDetector {
  private readonly analyzer = new AWS.GOAWSCredentialsManager({ autoLogin: false, interactive: false });

  /**
   * Classifies an error of a timeline query (bound: usable as a predicate).
   *
   * @param error - Error of the query
   * @returns Whether the user must run `aws sso login` and resume
   */
  public readonly isCredentialError = (error: unknown): boolean => {
    if (error instanceof Error && REJECTED_CREDENTIALS.has(error.name)) return true;
    return this.analyzer.analyzeError(error).type !== AWS.GOAWSCredentialsErrorType.UNKNOWN;
  };
}
