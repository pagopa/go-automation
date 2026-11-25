/**
 * Stable codes of the account errors. The cloud
 * worker classifies them as permanent failures.
 */
export type AwsAccountErrorCode =
  | 'AWS_ACCOUNT_NOT_CONFIGURED'
  | 'AWS_ACCOUNT_DIRECTORY_INVALID'
  | 'AWS_ACCOUNT_ENVIRONMENT_NOT_CONFIGURED'
  | 'AWS_ACCOUNT_ENVIRONMENT_NOT_ALLOWED'
  | 'AWS_OCCURRENCE_ACCOUNT_MISMATCH'
  | 'AWS_ACCOUNT_SELECTION_AMBIGUOUS'
  | 'AWS_ACCOUNT_UNREACHABLE';
