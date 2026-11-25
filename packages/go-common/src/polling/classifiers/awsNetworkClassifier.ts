import type { GORetryClassifier } from '../GORetryClassifier.js';
import type { GORetryDecision } from '../GORetryDecision.js';

/**
 * Regex of error codes / messages commonly emitted by Node's networking
 * stack and undici (the fetch implementation backing AWS SDK v3 HTTP).
 *
 * Compiled once at module load (per repo policy on RegExp).
 */
const NETWORK_ERROR_PATTERN = /ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR|EPIPE|EHOSTUNREACH|ENETUNREACH|ECONNRESET/;

/**
 * Classifier that flags transient network errors as retriable.
 *
 * Inspects:
 * - `error.cause.message` if `cause` is an Error (undici / `fetch` wraps the
 *   underlying syscall error in `cause`);
 * - `error.message` directly.
 *
 * Explicitly returns `'unknown'` (not `'retriable'`) for `AbortError`:
 * abort is a user-driven cancellation, never a transient network issue.
 *
 * @example
 * ```typescript
 * const classifier = combineClassifiers(awsThrottlingClassifier, awsNetworkClassifier);
 * ```
 */
export const awsNetworkClassifier: GORetryClassifier = {
  classify(error: unknown): GORetryDecision {
    if (!(error instanceof Error)) return 'unknown';
    if (error.name === 'AbortError') return 'unknown';

    const cause = (error as { cause?: unknown }).cause;
    const causeMessage = cause instanceof Error ? cause.message : '';

    if (NETWORK_ERROR_PATTERN.test(causeMessage) || NETWORK_ERROR_PATTERN.test(error.message)) {
      return 'retriable';
    }
    return 'unknown';
  },
};
