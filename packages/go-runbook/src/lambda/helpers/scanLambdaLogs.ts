import type { ResultField } from '@go-automation/go-common/aws';

import type { LambdaErrorCategory } from '../types/LambdaErrorCategory.js';
import { extractField } from './extractField.js';
import { extractLambdaRequestId } from './extractLambdaRequestId.js';
import { parseLambdaReportLine } from './parseLambdaReportLine.js';
import type { LambdaReportInfo } from './parseLambdaReportLine.js';
import { classifyLambdaError } from './classifyLambdaError.js';

/** Outcome of scanning a Lambda error-query result set. */
export interface LambdaErrorScan {
  /** Number of rows returned by the error scan. */
  readonly errorCount: number;
  /** Representative error message (drives classification and known cases). */
  readonly message: string;
  /** Classified error category. */
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
    const value = (extractField(row, '@requestId') ?? '').trim();
    if (value !== '') return value;
  }
  return undefined;
}

/**
 * Scans the rows produced by the Lambda error query and extracts the
 * representative error, the requestId, the parsed REPORT line and the
 * classified category.
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

  const messages = rows.map((row) => (extractField(row, '@message') ?? '').trim()).filter((message) => message !== '');

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
  const category = classifyLambdaError(representative, report);

  return {
    errorCount: rows.length,
    message: representative,
    category,
    ...(requestId !== undefined ? { requestId } : {}),
    ...(report !== undefined ? { report } : {}),
  };
}
