/**
 * JSON Logger Handler
 *
 * Emits one single-line JSON object per log entry. Designed for AWS-managed
 * runtimes (Lambda/CloudWatch) and other non-interactive contexts where one
 * line == one CloudWatch event: a structured record is far more readable and
 * queryable (Logs Insights) than the pretty/colored multi-line console output,
 * and multi-line payloads (e.g. the configuration summary) collapse into a
 * single event via the structured `data` field instead of many.
 *
 * Each record is `{ level, category, message, timestamp, [data] }`. Scalar
 * fields from `data` are also promoted to top-level fields when they do not
 * collide with core log fields, making common query keys (eventType, requestId,
 * parameter, etc.) directly filterable/indexable in CloudWatch Logs Insights.
 * ANSI codes are stripped from the message; empty spacer events (blank
 * newlines) are dropped to avoid noise.
 */

import { stripAnsi } from '../ansi.js';
import { GOLogEvent } from '../GOLogEvent.js';
import { GOLogEventCategory } from '../GOLogEventCategory.js';
import type { GOLoggerHandler } from '../GOLoggerHandler.js';
import { redactSensitiveLogText, redactSensitiveLogValue } from '../GOSensitiveLogRedactor.js';
import { safeJsonStringify, valueToString } from '../../utils/GOValueToString.js';

type JsonLogRecord = Record<string, unknown>;
type QueryableJsonValue = string | number | boolean | null;

const CORE_LOG_FIELDS = new Set(['category', 'data', 'jsonError', 'level', 'message', 'timestamp']);

/** Map a log category to a coarse severity level for filtering. */
function categoryToLevel(category: GOLogEventCategory): string {
  switch (category) {
    case GOLogEventCategory.ERROR:
      return 'error';
    case GOLogEventCategory.FATAL:
      return 'fatal';
    case GOLogEventCategory.WARNING:
      return 'warn';
    case GOLogEventCategory.SUCCESS:
    case GOLogEventCategory.INFO:
    case GOLogEventCategory.STEP:
    case GOLogEventCategory.HEADER:
    case GOLogEventCategory.SECTION:
    case GOLogEventCategory.TEXT:
      return 'info';
    default:
      return 'info';
  }
}

function stringifyLogRecord(record: JsonLogRecord): string {
  try {
    return safeJsonStringify(record);
  } catch (error) {
    const fallbackRecord: JsonLogRecord = {
      category: record['category'],
      jsonError: redactSensitiveLogText(valueToString(error)),
      level: record['level'],
      message: record['message'],
      timestamp: record['timestamp'],
    };

    return safeJsonStringify(fallbackRecord);
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function isQueryableJsonValue(value: unknown): value is QueryableJsonValue {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function promoteQueryableDataFields(record: JsonLogRecord, data: unknown): void {
  if (!isPlainRecord(data)) {
    return;
  }

  for (const [key, value] of Object.entries(data)) {
    if (CORE_LOG_FIELDS.has(key) || !isQueryableJsonValue(value)) {
      continue;
    }
    record[key] = value;
  }
}

export class GOJsonLoggerHandler implements GOLoggerHandler {
  public handle(event: GOLogEvent): void {
    const message = redactSensitiveLogText(stripAnsi(event.message));

    // Drop empty spacer events (newline()/blank) that carry no information.
    if (message.length === 0 && event.data === undefined) {
      return;
    }

    const record: JsonLogRecord = {
      level: categoryToLevel(event.category),
      category: event.category,
      message,
      timestamp: event.timestamp.toISOString(),
    };
    if (event.data !== undefined) {
      const data = redactSensitiveLogValue(event.data);
      record['data'] = data;
      promoteQueryableDataFields(record, data);
    }

    const line = stringifyLogRecord(record);
    if (event.category === GOLogEventCategory.ERROR || event.category === GOLogEventCategory.FATAL) {
      console.error(line);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }

  public async reset(): Promise<void> {
    // Stateless: nothing to reset (no indentation tracking).
  }
}
