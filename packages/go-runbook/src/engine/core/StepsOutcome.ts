import type { RunbookContext } from '../types/RunbookContext.js';

export interface StepsOutcome {
  readonly context: RunbookContext;
  readonly aborted: boolean;
  readonly failureReason?: string;
}
