/**
 * AWS Lambda RequestId is a UUID present on the `START`/`END`/`REPORT`
 * runtime lines (as `RequestId: <uuid>`), inline in application logs, and as
 * the second tab-separated field of the standard Lambda application line
 * (`<timestamp>\t<uuid>\t<LEVEL>\t<message>`).
 */
const REQUEST_ID_PATTERNS: ReadonlyArray<RegExp> = [
  /(?:START|END|REPORT)\s+RequestId:\s*([0-9a-fA-F-]{36})/,
  /RequestId:\s*([0-9a-fA-F-]{36})/,
  // Standard Lambda application line: timestamp, then the request id, then level.
  /^[^\t]+\t([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\t/,
];

/**
 * Extracts the Lambda `requestId` from a log message, trying the
 * `START`/`END`/`REPORT` lines first, then a generic inline `RequestId:`,
 * then the standard tab-separated application line prefix.
 *
 * Prefer the CloudWatch Logs Insights `@requestId` field when available
 * (see {@link scanLambdaLogs}); this message parser is the fallback.
 *
 * @param message - A log line `@message`
 * @returns The request id, or `undefined` when not found
 */
export function extractLambdaRequestId(message: string): string | undefined {
  for (const pattern of REQUEST_ID_PATTERNS) {
    const match = pattern.exec(message);
    const captured = match?.[1];
    if (captured !== undefined) return captured;
  }
  return undefined;
}
