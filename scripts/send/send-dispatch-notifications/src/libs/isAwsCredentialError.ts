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
 * @param error - Error of a timeline query
 * @returns Whether the user must run `aws sso login` and resume
 */
export function isAwsCredentialError(error: unknown): boolean {
  if (error instanceof Error && REJECTED_CREDENTIALS.has(error.name)) return true;
  const analysis = new AWS.GOAWSCredentialsManager({ autoLogin: false, interactive: false }).analyzeError(error);
  return analysis.type !== AWS.GOAWSCredentialsErrorType.UNKNOWN;
}
