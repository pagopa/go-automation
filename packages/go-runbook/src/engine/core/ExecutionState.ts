import type { ReadLedger } from '../reads/ReadLedger.js';
import type { ReadScope } from '../reads/ReadScope.js';
import type { DescendRequest } from '../types/DescendRequest.js';
import type { ObservedErrors } from '../types/ObservedErrors.js';

/** Per-execution state of {@link RunbookEngine.executeSteps}: created by each `execute`, never shared. */
export interface ExecutionState {
  /** Gaps of the reads of the execution, and the scope the steps record theirs in. */
  readonly ledger: ReadLedger;
  readonly scope: ReadScope;
  /** Errors observed and examined, as last declared by a step. */
  observedErrors?: ObservedErrors;
  /** Whether a read (`data` step) has already succeeded: a later failure leaves partial evidence. */
  evidenceCollected: boolean;
  /** Descents requested by the steps of an error-tree node. */
  readonly descends: DescendRequest[];
  /** Errors of the steps that failed, recovered ones included. */
  readonly failures: string[];
}
