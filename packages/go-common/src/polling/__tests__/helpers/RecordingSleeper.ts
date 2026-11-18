import { GOPollingError } from '../../GOPollingError.js';
import type { GOSleeper } from '../../GOSleeper.js';

/**
 * Fake sleeper that records the requested delays and resolves on the next microtask,
 * so tests can verify a backoff sequence without real waiting.
 * Honours an already-aborted signal like the default sleeper.
 */
export class RecordingSleeper implements GOSleeper {
  public readonly calls: number[] = [];

  /**
   * Records `ms` and resolves immediately.
   *
   * @param ms - Requested delay in milliseconds
   * @param signal - Optional abort signal; an aborted signal rejects with GOPollingError
   */
  async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted === true) {
      throw new GOPollingError('aborted', 'Aborted before sleep');
    }
    this.calls.push(ms);
    await Promise.resolve();
  }
}
