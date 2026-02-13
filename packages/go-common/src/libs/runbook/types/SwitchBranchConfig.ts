import type { Step } from './Step.js';

/**
 * Configuration for an inline switch-branch with sub-pipelines (v5 feature).
 * Each case maps a value to a sub-pipeline that runs inline.
 */
export interface SwitchBranchConfig {
  /** Unique step ID */
  readonly id: string;
  /** Human-readable label */
  readonly label: string;
  /** Reference to the value to switch on (e.g. 'vars.statusCode') */
  readonly ref: string;
  /** Map of value -> steps to execute */
  readonly cases: ReadonlyMap<string, ReadonlyArray<Step>>;
  /** Default steps if no case matches */
  readonly defaultSteps?: ReadonlyArray<Step>;
}
