import type { ErrorChainInterruptionReason } from './ErrorChainInterruptionReason.js';

/** Why and where a chain of the error tree stopped before a true leaf. */
export interface TreeChainInterruption {
  readonly reason: ErrorChainInterruptionReason;
  /** The level the chain could not read. */
  readonly target?: string;
}
