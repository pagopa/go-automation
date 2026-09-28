import { readRowField } from '@go-automation/go-common/aws';
import type { ResultField } from '@go-automation/go-common/aws';

import type { LambdaErrorCategory } from '../types/LambdaErrorCategory.js';
import { extractLambdaRequestId } from './extractLambdaRequestId.js';
import { parseLambdaReportLine } from './parseLambdaReportLine.js';
import type { LambdaReportInfo } from './parseLambdaReportLine.js';
import { classifyLambdaError } from './classifyLambdaError.js';

/** Outcome of scanning a Lambda error-query result set. */
export interface LambdaErrorScan {
  /** Number of rows returned by the error scan. */
  readonly errorCount: number;
  /** Representative error message; explicit runtime failures may be in another row. */
  readonly message: string;
  /** Category across all rows for explicit runtime failures, otherwise from the representative message. */
  readonly category: LambdaErrorCategory;
  /** Lambda requestId, when extractable. */
  readonly requestId?: string;
  /** Parsed REPORT line, when present in the rows. */
  readonly report?: LambdaReportInfo;
}

function isRuntimeLine(message: string): boolean {
  return /^(START|END|REPORT)\b/.test(message.trim());
}

/**
 * Returns the first non-empty CloudWatch Logs Insights `@requestId` field
 * across the rows. This field is reliably populated for Lambda log groups and
 * is preferred over parsing the message text.
 */
function firstRequestIdField(rows: ReadonlyArray<ReadonlyArray<ResultField>>): string | undefined {
  for (const row of rows) {
    const value = (readRowField(row, '@requestId') ?? '').trim();
    if (value !== '') return value;
  }
  return undefined;
}

/**
 * Scans the rows produced by the Lambda error query and extracts the
 * representative error, the requestId, the parsed REPORT line and the
 * classified category. Explicit runtime failures in any row take precedence
 * over a separate application error; a saturated REPORT alone remains a
 * last-resort OOM signal.
 *
 * The representative message prefers a real error line over the runtime
 * `START`/`END`/`REPORT` lines, but falls back to the `REPORT` line (e.g.
 * a bare `Status: timeout`) when no application error line is present.
 *
 * @param rows - CloudWatch Logs Insights result rows
 * @returns The scan result, or `undefined` when there are no rows
 */
export function scanLambdaLogs(rows: ReadonlyArray<ReadonlyArray<ResultField>>): LambdaErrorScan | undefined {
  if (rows.length === 0) return undefined;

  const messages = rows.map((row) => (readRowField(row, '@message') ?? '').trim()).filter((message) => message !== '');

  let report: LambdaReportInfo | undefined;
  // Prefer the reliable @requestId Logs Insights field; fall back to parsing
  // the message text (RequestId: forms and the tab-separated application line).
  let requestId = firstRequestIdField(rows);
  for (const message of messages) {
    report ??= parseLambdaReportLine(message);
    requestId ??= extractLambdaRequestId(message);
  }

  const reportMessage = messages.find((message) => /^REPORT\b/.test(message));
  const representative = messages.find((message) => !isRuntimeLine(message)) ?? reportMessage ?? messages[0] ?? '';
  let explicitRuntimeCategory: 'timeout' | 'out-of-memory' | undefined;
  for (const message of messages) {
    const rowCategory = classifyLambdaError(message);
    if (rowCategory === 'timeout') {
      explicitRuntimeCategory = 'timeout';
      break;
    }
    if (rowCategory === 'out-of-memory') explicitRuntimeCategory = 'out-of-memory';
  }
  const category = explicitRuntimeCategory ?? classifyLambdaError(representative, report);

  return {
    errorCount: rows.length,
    message: representative,
    category,
    ...(requestId !== undefined ? { requestId } : {}),
    ...(report !== undefined ? { report } : {}),
  };
}
