/** Why an error chain stopped before a true leaf. */
export type ErrorChainInterruptionReason = 'skipped' | 'unavailable' | 'incomplete' | 'failed' | 'cycle';
