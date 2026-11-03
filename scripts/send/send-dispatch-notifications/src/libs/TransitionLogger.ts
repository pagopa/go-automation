/**
 * Logging of the row transitions (§15): errors always, every transition with
 * `--verbose`. Only identifiers and error codes/messages are logged, never
 * the personal data of the rows (§14.4).
 */

import type { Core } from '@go-automation/go-common';
import type { Dispatch } from '@go-automation/go-send';

/** Events logged even without `--verbose`. */
const ERROR_EVENTS: ReadonlySet<string> = new Set([
  'SEND_FAILED',
  'SEND_UNCERTAIN',
  'REFUSED',
  'VERIFY_TIMEOUT',
  'REQUEST_ID_NOT_FOUND',
]);

/**
 * Formats and logs journal entries; plug `handle` into the session as
 * `onTransition`.
 */
export class TransitionLogger {
  constructor(
    private readonly logger: Core.GOLogger,
    private readonly verbose: boolean,
  ) {}

  /**
   * Logs one transition.
   *
   * @param entry - Journal entry just recorded
   */
  public handle(entry: Dispatch.JournalEntry): void {
    if (ERROR_EVENTS.has(entry.event)) {
      this.logger.warning(TransitionLogger.format(entry));
    } else if (this.verbose && entry.rowKey !== undefined) {
      this.logger.info(TransitionLogger.format(entry));
    }
  }

  /**
   * One-line description of an entry: row, event, identifiers, error.
   *
   * @param entry - Journal entry
   * @returns The log line
   */
  public static format(entry: Dispatch.JournalEntry): string {
    const parts = [
      `[${entry.rowKey ?? '-'}]`,
      entry.event,
      ...(entry.attempt === undefined ? [] : [`#${entry.attempt}`]),
      ...(entry.iun === undefined ? [] : [`iun=${entry.iun}`]),
      ...(entry.notificationRequestId === undefined ? [] : [`nrid=${entry.notificationRequestId}`]),
      ...(entry.requestId === undefined ? [] : [`requestId=${entry.requestId}`]),
      ...(entry.requestIdReason === undefined || entry.requestIdReason === 'FOUND' ? [] : [entry.requestIdReason]),
      ...(entry.error === undefined ? [] : [`${entry.error.code}: ${entry.error.message}`]),
      ...(entry.error?.details === undefined ? [] : [entry.error.details]),
      ...(entry.warning === undefined ? [] : [entry.warning]),
    ];
    return parts.join(' ');
  }
}
