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
   * A `ROW_INVALID` shows only the codes and fields of its validation issues:
   * their messages may quote the row values (tax ids, addresses), which stay
   * in the report.
   *
   * @param entry - Journal entry
   * @returns The log line
   */
  public static format(entry: Dispatch.JournalEntry): string {
    if (entry.event === 'ROW_INVALID') {
      return `[${entry.rowKey ?? '-'}] ROW_INVALID ${invalidRowIssues(entry)} (dettagli nel report)`;
    }
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

/**
 * `CODE(field)` of each validation issue of a `ROW_INVALID` entry (the
 * details are the JSON array of the issues), or the error code alone.
 */
function invalidRowIssues(entry: Dispatch.JournalEntry): string {
  const fallback = entry.error?.code ?? 'INVALID';
  const details = entry.error?.details;
  if (details === undefined) return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(details);
  } catch {
    return fallback;
  }
  if (!Array.isArray(parsed)) return fallback;
  const issues = parsed
    .filter(isIssue)
    .map((issue) => (issue.field === undefined ? issue.code : `${issue.code}(${issue.field})`));
  return issues.length === 0 ? fallback : issues.join(', ');
}

function isIssue(value: unknown): value is Pick<Dispatch.ValidationIssue, 'code' | 'field'> {
  if (typeof value !== 'object' || value === null || !('code' in value) || typeof value.code !== 'string') return false;
  return !('field' in value) || typeof value.field === 'string';
}
