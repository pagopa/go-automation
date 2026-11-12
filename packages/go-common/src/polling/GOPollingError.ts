import type { GOPollingErrorKind } from './GOPollingErrorKind.js';

/**
 * Typed error raised by {@link GOPoller} / {@link GORetryRunner} when the
 * polling infrastructure itself fails (timeout, abort, budget).
 *
 * Distinct from errors propagated through the operation/check function:
 * domain errors keep their own type, only infrastructure faults are
 * wrapped as `GOPollingError`. Branch on `error.kind` rather than parsing
 * the message.
 *
 * @example
 * ```typescript
 * try {
 *   await poller.poll(check);
 * } catch (error) {
 *   if (error instanceof GOPollingError && error.kind === 'aborted') {
 *     // graceful cancellation
 *   } else {
 *     throw error;
 *   }
 * }
 * ```
 */
export class GOPollingError extends Error {
  public readonly kind: GOPollingErrorKind;

  constructor(kind: GOPollingErrorKind, message: string) {
    super(message);
    this.name = 'GOPollingError';
    this.kind = kind;
  }
}
