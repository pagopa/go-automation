/**
 * Polling & retry module.
 *
 * Provides {@link GOPoller} (status polling) and {@link GORetryRunner}
 * (retry on transient failure) over shared primitives: {@link GOBackoff},
 * {@link GOSleeper}, retry classifiers.
 *
 * See `docs/evolutions/EVO-POLL-OPUS-01.md` for the full design rationale.
 */

// Backoff strategies
export { GOBackoff } from './GOBackoff.js';
export type { GOBackoffFn } from './GOBackoffFn.js';
export type { GOBackoffContext } from './GOBackoffContext.js';

// Sleeper
export { GODefaultSleeper } from './GODefaultSleeper.js';
export type { GOSleeper } from './GOSleeper.js';

// Errors
export { GOPollingError } from './GOPollingError.js';
export type { GOPollingErrorKind } from './GOPollingErrorKind.js';

// Retry classification
export type { GORetryDecision } from './GORetryDecision.js';
export type { GORetryAdvice } from './GORetryAdvice.js';
export type { GORetryClassifier } from './GORetryClassifier.js';
export * from './classifiers/index.js';
