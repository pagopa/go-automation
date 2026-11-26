import type { RunbookContext } from '../types/RunbookContext.js';
import type { StepResult } from '../types/StepResult.js';

export interface StepExecutionOutcome {
  readonly context: RunbookContext;
  readonly result: StepResult<unknown>;
}
