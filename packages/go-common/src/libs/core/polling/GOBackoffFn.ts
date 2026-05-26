import type { GOBackoffContext } from './GOBackoffContext.js';

/**
 * Pure function that returns the delay (ms) to wait before the next attempt.
 *
 * All required per-run state is delivered via {@link GOBackoffContext}.
 * Implementations MUST NOT close over mutable state at factory level; keep any per-run state in the supplied context.
 */
export type GOBackoffFn = (context: GOBackoffContext) => number;
