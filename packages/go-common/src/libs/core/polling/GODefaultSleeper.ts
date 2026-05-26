import { GOPollingError } from './GOPollingError.js';
import type { GOSleeper } from './GOSleeper.js';

/**
 * Default {@link GOSleeper} backed by `setTimeout` with full abort support.
 *
 * Differences vs a naive `new Promise(r => setTimeout(r, ms))`:
 * - rejects immediately if the signal is already aborted at entry;
 * - rejects as soon as the signal aborts during the wait (no need to
 *   wait out the remaining delay before observing cancellation);
 * - clears the timer on abort, removing the abort listener on resolve.
 */
export class GODefaultSleeper implements GOSleeper {
  async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted === true) {
      throw new GOPollingError('aborted', 'Aborted before sleep');
    }

    return new Promise<void>((resolve, reject) => {
      // `timer` is intentionally reassigned later (after the post-registration
      // abort re-check). Declared with explicit `undefined` so that the early
      // `onAbort()` path can clear it safely (clearTimeout(undefined) is a no-op).
      let timer: ReturnType<typeof setTimeout> | undefined = undefined;

      const onAbort = (): void => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        reject(new GOPollingError('aborted', 'Aborted during sleep'));
      };

      // Defensive ordering: register the abort listener BEFORE scheduling
      // the timer so any abort that lands after the entry check is observed.
      // In single-threaded JS the window between the entry check above and
      // this point is empty (no async boundary), but doing the registration
      // first survives future refactors that might introduce one.
      signal?.addEventListener('abort', onAbort, { once: true });

      // Re-check after registration. `AbortSignal` does NOT re-dispatch the
      // 'abort' event for listeners added after it was already aborted, so
      // we must explicitly trigger the abort path here if the signal turned
      // aborted between the entry check and now.
      if (signal?.aborted === true) {
        onAbort();
        return;
      }

      timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
    });
  }
}
