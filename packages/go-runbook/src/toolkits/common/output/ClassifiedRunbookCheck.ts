import type { RunbookCheck } from './RunbookCheck.js';
import type { RunbookCheckStatus } from './RunbookCheckStatus.js';

/** Classification returned after an engine run; no-runbook is decided before execution. */
export type ClassifiedRunbookCheck = Omit<RunbookCheck, 'status'> & {
  readonly status: Exclude<RunbookCheckStatus, 'NO_RUNBOOK'>;
};
