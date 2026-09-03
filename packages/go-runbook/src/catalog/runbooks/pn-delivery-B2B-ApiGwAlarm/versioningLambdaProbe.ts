export const VERSIONING_LAMBDA_PROBE_STEP_ID = 'query-versioning-lambda-errors';
export const VERSIONING_LAMBDA_PROBE_STATE_VAR = 'versioningLambdaProbeState';
export const VERSIONING_LAMBDA_ERROR_COUNT_VAR = 'versioningLambdaErrorCount';
export const VERSIONING_LAMBDA_ERROR_MESSAGE_VAR = 'versioningLambdaErrorMessage';
export const VERSIONING_LAMBDA_UNAVAILABLE_REASON_VAR = 'versioningLambdaUnavailableReason';

export type VersioningLambdaProbeState = 'skipped' | 'queried' | 'unavailable';
