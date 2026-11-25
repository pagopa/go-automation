import type { StepDiagnostics } from '../tracing/StepDiagnostics.js';
import type { StepCoverage } from './StepCoverage.js';

/** Result of one grouped read of a level. */
export interface TreeLevelReadResult {
  readonly success: boolean;
  /** Error of a read that returned nothing. */
  readonly error?: string;
  readonly rows: ReadonlyArray<unknown>;
  /** Incomplete parts of the read: they apply to every identifier of the batch. */
  readonly coverage?: ReadonlyArray<StepCoverage>;
  readonly diagnostics?: StepDiagnostics;
}
