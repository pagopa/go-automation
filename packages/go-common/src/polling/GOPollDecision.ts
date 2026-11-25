import type { GOPollDecisionContinue } from './GOPollDecisionContinue.js';
import type { GOPollDecisionFailure } from './GOPollDecisionFailure.js';
import type { GOPollDecisionSuccess } from './GOPollDecisionSuccess.js';

/**
 * Discriminated union returned by `GOPollCheckFn` to drive `GOPoller`.
 *
 * Three explicit states replace the legacy `T | undefined` encoding:
 * - `continue` — poll again (carries optional `reason`/`progress` for logs);
 * - `success` — return the wrapped value to the caller;
 * - `failure` — propagate the wrapped error to the caller.
 *
 * A `throw` inside the check is reserved for **unexpected** faults (bug,
 * network glitch in the probe) and is distinct from a modelled `failure`.
 */
export type GOPollDecision<T, E extends Error = Error> =
  GOPollDecisionContinue | GOPollDecisionSuccess<T> | GOPollDecisionFailure<E>;
