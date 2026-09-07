import { readRowField, type ResultField } from '@go-automation/go-common/aws';

import type { LogLine } from './LogLine.js';
import { normalizeOutputValue } from './outputValues.js';

/** Field names carrying the log message, in priority order. */
const MESSAGE_FIELDS: ReadonlyArray<string> = ['@message', 'message'];

/** Field names carrying the log timestamp, in priority order. */
const TIMESTAMP_FIELDS: ReadonlyArray<string> = ['@timestamp', 'timestamp'];

/**
 * Reads the first of `fieldNames` that resolves to a value with content.
 *
 * Presence is decided by {@link normalizeOutputValue}, so a field holding the
 * `-` placeholder falls through to the next candidate. Lets callers accept
 * both the CloudWatch-reserved name and its plain alias (`@message` /
 * `message`) without branching.
 *
 * @param row - A single result row
 * @param fieldNames - Field names to try, in priority order
 * @returns The raw value of the first field that carries content
 */
export function readFirstRowField(
  row: ReadonlyArray<ResultField>,
  fieldNames: ReadonlyArray<string>,
): string | undefined {
  for (const fieldName of fieldNames) {
    const value = readRowField(row, fieldName);
    if (normalizeOutputValue(value) !== undefined) return value;
  }
  return undefined;
}

/**
 * Converts result rows into the most recent log lines, oldest first.
 *
 * Rows with no message are dropped, the rest are sorted by timestamp and
 * the tail of at most `maxLogLines` entries is returned.
 * Complexity: O(N log N) over the rows.
 *
 * @param rows - Result rows to convert
 * @param maxLogLines - Maximum number of lines to keep
 * @returns The trailing log lines, in chronological order
 */
export function extractRecentLogLines(
  rows: ReadonlyArray<ReadonlyArray<ResultField>>,
  maxLogLines: number,
): ReadonlyArray<LogLine> {
  const logLines = rows
    .map(rowToLogLine)
    .filter((line): line is LogLine => line !== undefined)
    .sort((left, right) => timestampValue(left.timestamp) - timestampValue(right.timestamp));
  return logLines.slice(Math.max(0, logLines.length - maxLogLines));
}

function rowToLogLine(row: ReadonlyArray<ResultField>): LogLine | undefined {
  const message = normalizeOutputValue(readFirstRowField(row, MESSAGE_FIELDS));
  if (message === undefined) return undefined;
  return {
    timestamp: normalizeOutputValue(readFirstRowField(row, TIMESTAMP_FIELDS)) ?? '',
    message,
  };
}

/** Unparseable timestamps sort first rather than breaking the comparison. */
function timestampValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Renders a log line as the flat string record expected by
 * `RunbookEvidence.items`.
 *
 * @param logLine - The log line to render
 * @returns Its `timestamp` / `message` pair as a plain record
 */
export function logLineToRecord(logLine: LogLine): Readonly<Record<string, string>> {
  return { timestamp: logLine.timestamp, message: logLine.message };
}
