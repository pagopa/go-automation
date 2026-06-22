export const EXECUTE_RUNBOOK_LAMBDA_TIMEOUT_SECONDS = 900;
export const EXECUTE_RUNBOOK_WORKER_BUDGET_SECONDS = 720;
export const EXECUTE_RUNBOOK_VISIBILITY_TIMEOUT_SECONDS = 5_400;
export const EXECUTE_RUNBOOK_MESSAGE_RETENTION_SECONDS = 345_600;
export const EXECUTE_RUNBOOK_MAX_RECEIVE_COUNT = 5;
export const EXECUTE_RUNBOOK_RESERVED_CONCURRENCY = 3;
export const EXECUTE_RUNBOOK_BATCH_SIZE = 1;
export const EXECUTE_RUNBOOK_REGISTRY_CONTROL_REGION = 'eu-south-1';

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
