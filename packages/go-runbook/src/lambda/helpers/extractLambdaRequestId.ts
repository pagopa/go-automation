/**
 * AWS Lambda RequestId is a UUID present on the `START`/`END`/`REPORT`
 * runtime lines and, often, inline in application logs.
 */
const REQUEST_ID_PATTERNS: ReadonlyArray<RegExp> = [
  /(?:START|END|REPORT)\s+RequestId:\s*([0-9a-fA-F-]{36})/,
  /RequestId:\s*([0-9a-fA-F-]{36})/,
];

/**
 * Extracts the Lambda `requestId` from a log message, trying the
 * `START`/`END`/`REPORT` lines first, then a generic inline `RequestId:`.
 *
 * @param message - A log line `@message`
 * @returns The 36-char request id, or `undefined` when not found
 */
export function extractLambdaRequestId(message: string): string | undefined {
  for (const pattern of REQUEST_ID_PATTERNS) {
    const match = pattern.exec(message);
    const captured = match?.[1];
    if (captured !== undefined) return captured;
  }
  return undefined;
}
