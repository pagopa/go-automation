import type { AbortedOutcome } from './AbortedOutcome.js';
import type { FailedOutcome } from './FailedOutcome.js';
import type { InconclusiveOutcome } from './InconclusiveOutcome.js';
import type { KnownErrorMatchedOutcome } from './KnownErrorMatchedOutcome.js';
import type { ProcedureFailureOutcome } from './ProcedureFailureOutcome.js';
import type { ProcedureSuccessOutcome } from './ProcedureSuccessOutcome.js';
import type { UnknownErrorOutcome } from './UnknownErrorOutcome.js';

export type RunbookOutcome =
  | KnownErrorMatchedOutcome
  | UnknownErrorOutcome
  | InconclusiveOutcome
  | ProcedureSuccessOutcome
  | ProcedureFailureOutcome
  | FailedOutcome
  | AbortedOutcome;
