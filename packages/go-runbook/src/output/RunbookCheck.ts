/** Stable top-level classification shared by automation consumers. */
export type RunbookCheckStatus = 'HIT' | 'MISS' | 'NO-DATA' | 'NO_RUNBOOK' | 'CONFIG-ERROR' | 'EXECUTION-ERROR';

/** Classification of one runbook execution with bounded supporting fields. */
export interface RunbookCheck {
  readonly status: RunbookCheckStatus;
  readonly outcomeKind?: string;
  readonly primaryCaseId?: string;
  readonly primaryCaseDescription?: string;
  readonly matchedCaseIds: ReadonlyArray<string>;
  readonly durationMs?: number;
  readonly cloudWatchRecordsScanned?: number;
  readonly cloudWatchBytesScanned?: number;
  readonly error?: string;
}

/** Classification returned after an engine run; no-runbook is decided before execution. */
export type ClassifiedRunbookCheck = Omit<RunbookCheck, 'status'> & {
  readonly status: Exclude<RunbookCheckStatus, 'NO_RUNBOOK'>;
};
