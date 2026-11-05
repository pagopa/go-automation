/**
 * Logging of the row transitions (§15): errors always, every transition with
 * `--verbose`. Only identifiers and error codes/messages are logged, never
 * the personal data of the rows (§14.4).
 */

import type { Core } from '@go-automation/go-common';
import type { Dispatch } from '@go-automation/go-send';

/** Events logged even without `--verbose`. */
const ERROR_EVENTS: ReadonlySet<string> = new Set([
  'ROW_INVALID',
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
   * The error details are never logged as they are: the messages of the
   * validation issues (`ROW_INVALID`) and the `detail` of the errors returned
   * by SEND (`REFUSED`, `SEND_FAILED`) may quote the row values (tax ids,
   * addresses). Only their codes and fields are shown; the details stay in
   * the report.
   *
   * @param entry - Journal entry
   * @returns The log line
   */
  public static format(entry: Dispatch.JournalEntry): string {
    if (entry.event === 'ROW_INVALID') {
      return `[${entry.rowKey ?? '-'}] ROW_INVALID ${issueCodes(entry.error?.details) ?? entry.error?.code ?? 'INVALID'} (dettagli nel report)`;
    }
    const detailCodes = issueCodes(entry.error?.details);
    const parts = [
      `[${entry.rowKey ?? '-'}]`,
      entry.event,
      ...(entry.attempt === undefined ? [] : [`#${entry.attempt}`]),
      ...(entry.iun === undefined ? [] : [`iun=${entry.iun}`]),
      ...(entry.notificationRequestId === undefined ? [] : [`nrid=${entry.notificationRequestId}`]),
      ...(entry.requestId === undefined ? [] : [`requestId=${entry.requestId}`]),
      ...(entry.requestIdReason === undefined || entry.requestIdReason === 'FOUND' ? [] : [entry.requestIdReason]),
      ...(entry.error === undefined ? [] : [`${entry.error.code}: ${entry.error.message}`]),
      ...(detailCodes === undefined ? [] : [`[${detailCodes}] (dettagli nel report)`]),
      ...(entry.warning === undefined ? [] : [entry.warning]),
    ];
    return parts.join(' ');
  }
}

/**
 * `CODE(field)` of each item of error details that are a JSON array: the
 * validation issues of `ROW_INVALID` (`field`) or the errors returned by
 * SEND (`element`). Messages and `detail` texts are left out.
 *
 * @returns The codes, or `undefined` when the details are absent or not such an array
 */
function issueCodes(details: string | undefined): string | undefined {
  if (details === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(details);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const items: ReadonlyArray<unknown> = parsed;
  const codes = items.flatMap((item) => {
    if (typeof item !== 'object' || item === null || !('code' in item) || typeof item.code !== 'string') return [];
    const field = 'field' in item ? item.field : 'element' in item ? item.element : undefined;
    return [typeof field === 'string' ? `${item.code}(${field})` : item.code];
  });
  return codes.length === 0 ? undefined : codes.join(', ');
}
