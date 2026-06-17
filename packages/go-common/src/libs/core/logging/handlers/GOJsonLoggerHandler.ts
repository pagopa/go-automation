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
 * Each record is `{ level, category, message, timestamp, [data] }`. ANSI codes
 * are stripped from the message; empty spacer events (blank newlines) are
 * dropped to avoid noise.
 */

import { stripAnsi } from '../ansi.js';
import { GOLogEvent } from '../GOLogEvent.js';
import { GOLogEventCategory } from '../GOLogEventCategory.js';
import type { GOLoggerHandler } from '../GOLoggerHandler.js';

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

export class GOJsonLoggerHandler implements GOLoggerHandler {
  public handle(event: GOLogEvent): void {
    const message = stripAnsi(event.message);

    // Drop empty spacer events (newline()/blank) that carry no information.
    if (message.length === 0 && event.data === undefined) {
      return;
    }

    const record: Record<string, unknown> = {
      level: categoryToLevel(event.category),
      category: event.category,
      message,
      timestamp: event.timestamp.toISOString(),
    };
    if (event.data !== undefined) {
      record['data'] = event.data;
    }

    const line = JSON.stringify(record);
    if (event.category === GOLogEventCategory.ERROR || event.category === GOLogEventCategory.FATAL) {
      console.error(line);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async reset(): Promise<void> {
    // Stateless: nothing to reset (no indentation tracking).
  }
}
