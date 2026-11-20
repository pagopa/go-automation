import type { ErrorChainInterruptionReason } from '../../../engine/types/ErrorChainInterruptionReason.js';

/** Why the chains of a group stopped before a true leaf, with how many of them. */
export interface ErrorChainInterruption {
  readonly reason: ErrorChainInterruptionReason;
  readonly target?: string;
  readonly count: number;
}
