import type { ErrorChainInterruptionReason } from '../../../engine/index.js';

/** Why the chains of a group stopped before a true leaf, with how many of them. */
export interface ErrorChainInterruption {
  readonly reason: ErrorChainInterruptionReason;
  readonly target?: string;
  readonly count: number;
}
