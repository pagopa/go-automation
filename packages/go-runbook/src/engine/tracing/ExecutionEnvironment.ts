import type { ExecutionEnvironmentExtensions } from './ExecutionEnvironmentExtensions.js';

/**
 * Environment of an execution, stored as received in the trace. The engine
 * knows only who invoked it; operational toolkits add their fields
 * (EVO-RBREORG-OPUS-01 §7.1.3 C).
 */
export interface ExecutionEnvironment extends ExecutionEnvironmentExtensions {
  /** How the execution was triggered */
  readonly invokedBy: 'manual' | 'alarm' | 'schedule';
}
