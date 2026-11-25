import type { ERROR_CHAIN_INTERRUPTION_REASONS } from './ERROR_CHAIN_INTERRUPTION_REASONS.js';

/** Why an error chain stopped before a true leaf. */
export type ErrorChainInterruptionReason = (typeof ERROR_CHAIN_INTERRUPTION_REASONS)[number];
