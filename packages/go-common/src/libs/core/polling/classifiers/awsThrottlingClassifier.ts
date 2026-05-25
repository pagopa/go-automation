import type { GORetryClassifier } from '../GORetryClassifier.js';
import type { GORetryDecision } from '../GORetryDecision.js';

/**
 * AWS SDK error names known to indicate throttling / rate-limiting.
 *
 * Drawn from `@aws-sdk/util-retry` standard retryable error set, restricted
 * to the throttling family (omits transient server errors handled elsewhere).
 */
const AWS_THROTTLING_ERROR_NAMES: ReadonlySet<string> = new Set([
  'ProvisionedThroughputExceededException',
  'ThrottlingException',
  'Throttling',
  'ThrottledException',
  'RequestThrottledException',
  'RequestThrottled',
  'RequestLimitExceeded',
  'RequestTimeoutException',
  'TooManyRequestsException',
  'LimitExceededException',
  'BandwidthLimitExceeded',
  'EC2ThrottledException',
  'PriorRequestNotComplete',
  'TransactionInProgressException',
]);

/**
 * Classifier that flags AWS SDK throttling errors as retriable.
 *
 * Returns `'unknown'` (not `'fatal'`) on non-throttling errors so it composes
 * cleanly with other classifiers via {@link combineClassifiers}.
 *
 * @example
 * ```typescript
 * const runner = new GORetryRunner({
 *   classifier: awsThrottlingClassifier,
 *   backoff: GOBackoff.exponentialJittered(100, 5000),
 * });
 * ```
 */
export const awsThrottlingClassifier: GORetryClassifier = {
  classify(error: unknown): GORetryDecision {
    if (!isErrorWithName(error)) return 'unknown';
    return AWS_THROTTLING_ERROR_NAMES.has(error.name) ? 'retriable' : 'unknown';
  },
};

function isErrorWithName(value: unknown): value is { readonly name: string } {
  return typeof value === 'object' && value !== null && typeof (value as { name?: unknown }).name === 'string';
}
