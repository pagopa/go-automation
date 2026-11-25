/**
 * The re-reads left to an execution for dividing the saturated reads: one budget for every reader of the execution,
 * created by the engine.
 */
export interface ReadSplitBudget {
  remaining: number;
}
