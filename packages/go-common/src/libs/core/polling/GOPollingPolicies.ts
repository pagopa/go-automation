import { GOBackoff } from './GOBackoff.js';
import type { GOPollerOptions } from './GOPollerOptions.js';
import type { GORetryRunnerOptions } from './GORetryRunnerOptions.js';
import { awsNetworkClassifier } from './classifiers/awsNetworkClassifier.js';
import { awsThrottlingClassifier } from './classifiers/awsThrottlingClassifier.js';
import { combineClassifiers } from './classifiers/combineClassifiers.js';
import { httpRetryAfterClassifier } from './classifiers/httpRetryAfterClassifier.js';

/**
 * HTTP statuses considered retriable by the `httpDownload` preset.
 *
 * Includes the standard transient response codes:
 * - 408 Request Timeout (client/intermediary timeout)
 * - 425 Too Early (TLS 1.3 early-data replay protection)
 * - 429 Too Many Requests (rate limit; honours `Retry-After`)
 * - 5xx server-side transient faults
 */
const HTTP_DOWNLOAD_RETRIABLE_STATUSES: ReadonlySet<number> = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * Pre-baked options bundles for the most common polling / retry use cases
 * in the monorepo.
 *
 * Every entry is a **factory** that returns a fresh POJO on each call: this
 * preserves the "no shared mutable state" invariant of the module (see
 * EVO-POLL-OPUS-01 §7.10). Consumers compose presets with `{ ...preset(), ... }`
 * to override individual fields without mutating the source.
 *
 * Governance: a preset is added only when it covers ≥2 callsite reals.
 * Single use cases write the options inline. Presets are recommendations,
 * not contracts: changing one is not a breaking change for consumers.
 *
 * @example
 * ```typescript
 * // Default preset
 * await new GOPoller(GOPollingPolicies.athenaQuery()).poll(check);
 *
 * // Default + override via spread
 * await new GOPoller({
 *   ...GOPollingPolicies.athenaQuery(),
 *   maxAttempts: 200,
 *   signal: ac.signal,
 * }).poll(check);
 *
 * // Retry runner with a preset
 * await new GORetryRunner(GOPollingPolicies.awsThrottling()).run(op);
 * ```
 */
export const GOPollingPolicies = {
  // ── Status polling presets (GOPollerOptions) ───────────────────────────

  /**
   * Athena query state polling.
   * 120 attempts × exponential(500ms → 3s) ≈ ~6 minutes total max.
   */
  athenaQuery: (): GOPollerOptions => ({
    maxAttempts: 120,
    backoff: GOBackoff.exponential(500, 3000),
  }),

  /**
   * CloudWatch Logs Insights query state polling.
   * 60 attempts × exponential(500ms → 5s) ≈ ~5 minutes total max.
   */
  cloudWatchLogsQuery: (): GOPollerOptions => ({
    maxAttempts: 60,
    backoff: GOBackoff.exponential(500, 5000),
  }),

  /**
   * SEND notification IUN polling.
   * 8 attempts × 30s constant = 4 minutes total max.
   */
  sendIunPolling: (): GOPollerOptions => ({
    maxAttempts: 8,
    backoff: GOBackoff.constant(30000),
  }),

  // ── Retry presets (GORetryRunnerOptions) ───────────────────────────────

  /**
   * Retry on AWS throttling + transient network errors.
   * 5 attempts × jittered exponential(100ms → 5s). Default for DynamoDB,
   * S3, CloudWatch Metrics, EventBridge.
   */
  awsThrottling: (): GORetryRunnerOptions => ({
    maxAttempts: 5,
    backoff: GOBackoff.exponentialJittered(100, 5000),
    classifier: combineClassifiers(awsThrottlingClassifier, awsNetworkClassifier),
    unknownDecision: 'fatal',
  }),

  /**
   * HTTP file download retry: respects server `Retry-After` for 429/5xx and
   * falls back to jittered exponential(500ms → 30s) on other transient faults.
   */
  httpDownload: (): GORetryRunnerOptions => ({
    maxAttempts: 4,
    backoff: GOBackoff.exponentialJittered(500, 30000),
    classifier: combineClassifiers(httpRetryAfterClassifier(HTTP_DOWNLOAD_RETRIABLE_STATUSES), awsNetworkClassifier),
    unknownDecision: 'fatal',
  }),

  /**
   * SQS batch send retry: short jittered backoff. `unknownDecision: 'retriable'`
   * because SQS `Failed` entries are usually transient and the runner re-sends
   * only the failed entries (see `AWSSQSService.sendMessageBatch`).
   */
  sqsBatchSend: (): GORetryRunnerOptions => ({
    maxAttempts: 3,
    backoff: GOBackoff.exponentialJittered(200, 2000),
    classifier: combineClassifiers(awsThrottlingClassifier, awsNetworkClassifier),
    unknownDecision: 'retriable',
  }),
} as const;
