import type { GOBackoffContext } from './GOBackoffContext.js';

/**
 * Pure function that returns the delay (ms) to wait before the next attempt.
 *
 * All required per-run state is delivered via {@link GOBackoffContext}.
 * Implementations MUST NOT close over mutable state at factory level —
 * see EVO-POLL-OPUS-01 §7.9.
 */
export type GOBackoffFn = (context: GOBackoffContext) => number;
