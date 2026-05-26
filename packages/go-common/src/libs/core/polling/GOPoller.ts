import { GOBackoff } from './GOBackoff.js';
import { GODefaultSleeper } from './GODefaultSleeper.js';
import type { GOPollDecision } from './GOPollDecision.js';
import { GOPollingError } from './GOPollingError.js';
import type { GOPollerOptions } from './GOPollerOptions.js';

/** Default number of attempts when `maxAttempts` is not specified. */
const DEFAULT_MAX_ATTEMPTS = 60;

/**
 * Probe function invoked by `GOPoller.poll` on each iteration.
 *
 * Returns a {@link GOPollDecision} that drives the poller:
 * - `{ type: 'continue' }` → sleep and try again;
 * - `{ type: 'success', value }` → return `value` to the caller;
 * - `{ type: 'failure', error }` → propagate `error` to the caller.
 *
 * A thrown exception is reserved for unexpected faults (bug, network glitch
 * in the probe). The poller propagates such throws as-is, distinct from a
 * modelled `failure`.
 */
export type GOPollCheckFn<T, E extends Error = Error> = (attempt: number) => Promise<GOPollDecision<T, E>>;

/**
 * Status polling: re-runs a probe until the observed state is terminal.
 *
 * Distinct from `GORetryRunner` (retry on transient failure): a poller
 * re-executes a **check** that observes external state, while a retry
 * runner re-executes the **same operation** that previously failed.
 *
 * Per-run state (`previousDelayMs`) lives in `poll()`, NOT on the instance:
 * two `poll()` calls in parallel on the same instance are isolated even
 * when sharing a stateful backoff. See EVO-POLL-OPUS-01 §7.9.
 *
 * @example
 * ```typescript
 * const poller = new GOPoller({
 *   maxAttempts: 120,
 *   backoff: GOBackoff.exponential(500, 3000),
 * });
 *
 * const response = await poller.poll(async () => {
 *   const state = await client.send(new GetQueryExecutionCommand({ ... }));
 *   if (state === 'SUCCEEDED') return { type: 'success', value: state };
 *   if (state === 'FAILED') return { type: 'failure', error: new Error('Athena FAILED') };
 *   return { type: 'continue', reason: state };
 * });
 * ```
 */
export class GOPoller {
  constructor(private readonly options: GOPollerOptions = {}) {}

  /**
   * Repeatedly invokes `check` until it returns `success`, `failure`,
   * or the runner exhausts its attempts/budget/signal.
   *
   * @param check - Async probe returning a `GOPollDecision`.
   * @returns The value carried by the first `success` decision.
   * @throws The error from `failure` (kept original type).
   *   {@link GOPollingError} on timeout, abort, or budget exceeded.
   *   The check's own thrown exceptions propagate as-is.
   */
  async poll<T, E extends Error = Error>(check: GOPollCheckFn<T, E>): Promise<T> {
    const maxAttempts = this.options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const backoff = this.options.backoff ?? GOBackoff.exponential();
    const sleeper = this.options.sleeper ?? new GODefaultSleeper();
    const maxElapsedMs = this.options.maxElapsedMs;
    const signal = this.options.signal;
    const startMs = Date.now();

    // Per-run state: lives here, never on `this`. Two concurrent poll() calls
    // on the same instance must not see each other's previousDelayMs.
    let previousDelayMs: number | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      checkAbortAndBudget(signal, startMs, maxElapsedMs);

      const decision = await check(attempt);

      switch (decision.type) {
        case 'success':
          return decision.value;
        case 'failure':
          // Transparent propagation: the error keeps its domain type.
          throw decision.error;
        case 'continue':
          if (attempt < maxAttempts - 1) {
            const delayMs = backoff({
              attempt,
              ...(previousDelayMs !== undefined ? { previousDelayMs } : {}),
            });
            this.options.onAttempt?.({
              attempt,
              elapsedMs: Date.now() - startMs,
              nextDelayMs: delayMs,
              ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
              ...(decision.progress !== undefined ? { progress: decision.progress } : {}),
            });
            await sleeper.sleep(delayMs, signal);
            previousDelayMs = delayMs;
          }
          break;
        default:
          // Exhaustive: the union has no other variants. Defensive guard.
          throw new Error(`Unknown GOPollDecision type: ${JSON.stringify(decision)}`);
      }
    }

    throw new GOPollingError('timeout', `Polling timed out after ${maxAttempts} attempts`);
  }
}

function checkAbortAndBudget(signal: AbortSignal | undefined, startMs: number, maxElapsedMs: number | undefined): void {
  if (signal?.aborted === true) {
    throw new GOPollingError('aborted', 'Aborted before attempt');
  }
  if (maxElapsedMs !== undefined && Date.now() - startMs > maxElapsedMs) {
    throw new GOPollingError('budget-exceeded', `Budget of ${String(maxElapsedMs)}ms exceeded`);
  }
}
