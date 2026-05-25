import { toError } from '../errors/GOErrorUtils.js';

import { GOBackoff } from './GOBackoff.js';
import { GODefaultSleeper } from './GODefaultSleeper.js';
import { GOPollingError } from './GOPollingError.js';
import type { GORetryRunnerOptions } from './GORetryRunnerOptions.js';
import { normalizeAdvice } from './classifiers/combineClassifiers.js';

/** Default number of attempts when not specified. */
const DEFAULT_MAX_ATTEMPTS = 3;

/** Operation invoked by `GORetryRunner.run`, receiving the zero-based attempt index. */
export type GORetryOperationFn<T> = (attempt: number) => Promise<T>;

/**
 * Re-runs an operation on transient failures, with backoff between attempts.
 *
 * Distinct from {@link GOPoller} (status polling): a retry runner re-executes
 * the **same** operation that previously failed; a poller re-executes a
 * **check** that observes external state.
 *
 * Per-run state (`previousDelayMs`) lives in `run()`, NOT in the runner
 * instance: two `run()` calls in parallel on the same instance are
 * isolated even when sharing a stateful backoff like
 * `GOBackoff.decorrelatedJittered`. See EVO-POLL-OPUS-01 §7.9.
 *
 * @example
 * ```typescript
 * const runner = new GORetryRunner({
 *   maxAttempts: 5,
 *   backoff: GOBackoff.exponentialJittered(100, 5000),
 *   classifier: combineClassifiers(awsThrottlingClassifier, awsNetworkClassifier),
 * });
 *
 * const table = await runner.run(() => dynamoDB.send(new DescribeTableCommand({ TableName })));
 * ```
 */
export class GORetryRunner {
  constructor(private readonly options: GORetryRunnerOptions = {}) {}

  /**
   * Executes `operation`, retrying on transient failures.
   *
   * @param operation - Async function to execute. Receives the zero-based
   *   attempt index for callers that need it (rare; usually ignored).
   * @returns The value returned by the first successful attempt.
   * @throws The last operation error when retries are exhausted or the
   *   classifier returns `'fatal'`. Throws {@link GOPollingError} on
   *   abort or budget exceeded.
   */
  async run<T>(operation: GORetryOperationFn<T>): Promise<T> {
    const maxAttempts = this.options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const backoff = this.options.backoff ?? GOBackoff.exponentialJittered();
    const sleeper = this.options.sleeper ?? new GODefaultSleeper();
    const classifier = this.options.classifier;
    const unknownDecision = this.options.unknownDecision ?? 'fatal';
    const maxElapsedMs = this.options.maxElapsedMs;
    const signal = this.options.signal;
    const startMs = Date.now();

    // Per-run state. Critical: must live here, NOT on `this`, so that two
    // concurrent run() calls on the same GORetryRunner instance never
    // contaminate each other's backoff sequence.
    let previousDelayMs: number | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      checkAbortAndBudget(signal, startMs, maxElapsedMs);

      try {
        return await operation(attempt);
      } catch (error) {
        const advice =
          classifier !== undefined ? normalizeAdvice(classifier.classify(error)) : { decision: 'unknown' as const };
        const effective = advice.decision === 'unknown' ? unknownDecision : advice.decision;

        if (effective === 'fatal' || attempt === maxAttempts - 1) {
          throw error;
        }

        // Override from classifier (e.g. Retry-After) wins over the backoff
        // for this single attempt. We do NOT update previousDelayMs in that
        // case so that decorrelated jitter sequences aren't perturbed by a
        // one-off server-driven value.
        const overridden = advice.delayMs !== undefined;
        const delayMs =
          advice.delayMs ?? backoff({ attempt, ...(previousDelayMs !== undefined ? { previousDelayMs } : {}) });

        this.options.onAttempt?.({
          attempt,
          elapsedMs: Date.now() - startMs,
          lastError: toError(error),
          nextDelayMs: delayMs,
          delayOverridden: overridden,
        });

        await sleeper.sleep(delayMs, signal);
        if (!overridden) previousDelayMs = delayMs;
      }
    }

    // Reachable only on the degenerate case maxAttempts=0 (no attempt ran).
    // The runtime loop guarantees that any real attempt either returns or
    // throws inside the loop body, so `lastError` here is always undefined.
    throw new GOPollingError('exhausted', `Retry exhausted after ${maxAttempts} attempts`);
  }
}

function checkAbortAndBudget(signal: AbortSignal | undefined, startMs: number, maxElapsedMs: number | undefined): void {
  if (signal?.aborted === true) {
    throw new GOPollingError('aborted', 'Aborted before attempt');
  }
  if (maxElapsedMs !== undefined && Date.now() - startMs > maxElapsedMs) {
    throw new GOPollingError('budget-exceeded', `Budget of ${maxElapsedMs}ms exceeded`);
  }
}
