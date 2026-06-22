import type { AutomaticRunbookExecutionStatus } from '@go-automation/go-watchtower-client';

import type { WorkerDisposition } from './WorkerDisposition.js';

export interface ExecuteRunbookResult {
  readonly disposition: WorkerDisposition;
  readonly executionId: string;
  readonly status: AutomaticRunbookExecutionStatus;
  readonly attemptId?: string;
  readonly suppressedReason?: ExecuteRunbookSuppressedReason;
}

export type ExecuteRunbookSuppressedReason =
  | 'ALREADY_RUNNING'
  | 'ALREADY_TERMINAL'
  | 'CANCEL_REQUESTED'
  | 'STALE_ATTEMPT';
