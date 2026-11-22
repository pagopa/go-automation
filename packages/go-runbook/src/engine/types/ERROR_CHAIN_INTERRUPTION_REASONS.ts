/** Every reason an error chain can stop before a true leaf, the values of {@link ErrorChainInterruptionReason}. */
export const ERROR_CHAIN_INTERRUPTION_REASONS = ['skipped', 'unavailable', 'incomplete', 'failed', 'cycle'] as const;
