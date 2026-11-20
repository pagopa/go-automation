import type { ErrorChainInterruptionReason } from '../../../engine/types/ErrorChainInterruptionReason.js';

/** Chains of an error tree interrupted for one reason. */
export interface CoverageInterruptionCount {
  readonly reason: ErrorChainInterruptionReason;
  readonly count: number;
}
