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
      const onAbort = (): void => {
        clearTimeout(timer);
        reject(new GOPollingError('aborted', 'Aborted during sleep'));
      };

      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}
