/**
 * Recognition of expired or rejected AWS credentials during the requestId
 * phase (§8.3).
 */

import { AWS } from '@go-automation/go-common';

/** SDK error names of credentials rejected by the service. */
const REJECTED_CREDENTIALS: ReadonlySet<string> = new Set(['UnrecognizedClientException', 'InvalidSignatureException']);

/**
 * Tells whether a timeline query failed because the AWS credentials expired
 * or were rejected: SSO session expired/invalid and credential provider
 * failures (go-common analysis), or credentials refused by DynamoDB.
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
