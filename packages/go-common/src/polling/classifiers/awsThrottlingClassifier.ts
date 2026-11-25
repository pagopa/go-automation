import type { GORetryClassifier } from '../GORetryClassifier.js';
import type { GORetryDecision } from '../GORetryDecision.js';

/**
 * AWS SDK error names treated as retriable by this classifier.
 *
 * Covers two families both considered transient by `@aws-sdk/util-retry`'s
 * standard retry strategy:
 * - **Throttling / rate-limiting**: provisioned throughput, request limits, ...
 * - **Transient server errors**: 5xx server-side faults (`InternalServerError`,
 *   `ServiceUnavailable`) that AWS expects clients to retry.
 *
 * Both are bundled here because they share the same retry policy (backoff
 * with jitter) and a single classifier keeps the call sites simple.
 */
const AWS_THROTTLING_ERROR_NAMES: ReadonlySet<string> = new Set([
  // Throttling / rate-limiting
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
  // Transient server errors (5xx)
  'InternalServerError',
  'ServiceUnavailable',
  'InternalFailure',
  'ServiceFailure',
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
