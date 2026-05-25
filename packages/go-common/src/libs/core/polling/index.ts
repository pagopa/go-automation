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

// Retry runner
export { GORetryRunner } from './GORetryRunner.js';
export type { GORetryOperationFn } from './GORetryRunner.js';
export type { GORetryRunnerOptions, GORetryAttemptHandler } from './GORetryRunnerOptions.js';
export type { GORetryAttemptInfo } from './GORetryAttemptInfo.js';
export type { GORetryResult } from './GORetryResult.js';

// Status poller
export { GOPoller } from './GOPoller.js';
export type { GOPollCheckFn } from './GOPoller.js';
export type { GOPollerOptions, GOPollAttemptHandler } from './GOPollerOptions.js';
export type { GOPollAttemptInfo } from './GOPollAttemptInfo.js';
export type { GOPollDecision } from './GOPollDecision.js';
export type { GOPollDecisionContinue } from './GOPollDecisionContinue.js';
export type { GOPollDecisionSuccess } from './GOPollDecisionSuccess.js';
export type { GOPollDecisionFailure } from './GOPollDecisionFailure.js';
