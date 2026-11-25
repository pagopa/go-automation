import type { AbortedOutcome } from './AbortedOutcome.js';
import type { FailedOutcome } from './FailedOutcome.js';
import type { InconclusiveOutcome } from './InconclusiveOutcome.js';
import type { KnownCaseMatchedOutcome } from './KnownCaseMatchedOutcome.js';
import type { ProcedureFailureOutcome } from './ProcedureFailureOutcome.js';
import type { ProcedureSuccessOutcome } from './ProcedureSuccessOutcome.js';
import type { UnknownCaseOutcome } from './UnknownCaseOutcome.js';

export type RunbookOutcome =
  | KnownCaseMatchedOutcome
  | UnknownCaseOutcome
  | InconclusiveOutcome
  | ProcedureSuccessOutcome
  | ProcedureFailureOutcome
  | FailedOutcome
  | AbortedOutcome;
