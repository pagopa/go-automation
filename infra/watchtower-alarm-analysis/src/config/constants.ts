export const EXECUTE_RUNBOOK_LAMBDA_TIMEOUT_SECONDS = 900;
export const EXECUTE_RUNBOOK_WORKER_BUDGET_SECONDS = 720;
export const EXECUTE_RUNBOOK_VISIBILITY_TIMEOUT_SECONDS = 5_400;
export const EXECUTE_RUNBOOK_MESSAGE_RETENTION_SECONDS = 345_600;
export const EXECUTE_RUNBOOK_MAX_RECEIVE_COUNT = 5;
export const EXECUTE_RUNBOOK_RESERVED_CONCURRENCY = 3;
export const EXECUTE_RUNBOOK_BATCH_SIZE = 1;
export const EXECUTE_RUNBOOK_REGISTRY_CONTROL_REGION = 'eu-south-1';
export const EXECUTE_RUNBOOK_LAMBDA_NAME = 'go-execute-runbook';
export const AUTOMATIC_RUNBOOK_CATALOG_KEY = 'automatic-runbooks/v1/current.json';

export function buildAutomaticRunbookCatalogBucketName(environment: string, accountId: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(environment)) throw new Error('DEPLOY_ENV is not valid for S3 naming');
  if (!/^\d{12}$/.test(accountId)) throw new Error('AWS account id is invalid');
  const name = `go-auto-${accountId}-${environment}-runbooks`;
  if (name.length > 63) throw new Error('Automatic runbook catalog bucket name exceeds the S3 limit');
  return name;
}

/** Extracts the 12-digit AWS account id from an ARN. */
export function accountIdFromArn(arn: string): string {
  const accountId = arn.split(':')[4];
  if (accountId === undefined || !/^\d{12}$/.test(accountId)) {
    throw new Error('Cannot derive AWS account id from ARN');
  }
  return accountId;
}

export function assertExecuteRunbookCapacityConstants(): void {
  if (EXECUTE_RUNBOOK_VISIBILITY_TIMEOUT_SECONDS < 6 * EXECUTE_RUNBOOK_LAMBDA_TIMEOUT_SECONDS) {
    throw new Error('SQS visibility timeout must be at least six times the Lambda timeout');
  }
  if (EXECUTE_RUNBOOK_WORKER_BUDGET_SECONDS >= EXECUTE_RUNBOOK_LAMBDA_TIMEOUT_SECONDS) {
    throw new Error('Worker budget must expire before the Lambda timeout');
  }
  if (EXECUTE_RUNBOOK_MAX_RECEIVE_COUNT < 5 || EXECUTE_RUNBOOK_BATCH_SIZE !== 1) {
    throw new Error('Execute-runbook SQS retry/batch constants violate the v1 contract');
  }
}
