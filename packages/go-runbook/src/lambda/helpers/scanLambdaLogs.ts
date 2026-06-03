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
  let requestId: string | undefined;
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
