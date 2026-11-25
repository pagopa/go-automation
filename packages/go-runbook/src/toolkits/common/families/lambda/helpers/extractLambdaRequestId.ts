/**
 * AWS Lambda RequestId is a UUID present on the `START`/`END`/`REPORT`
 * runtime lines (as `RequestId: <uuid>`), inline in application logs, and as
 * the second tab-separated field of the standard Lambda application line
 * (`<timestamp>\t<uuid>\t<LEVEL>\t<message>`).
 */
const REQUEST_ID_PATTERNS: ReadonlyArray<RegExp> = [
  // The line's own invocation first: a runtime line, or the prefix of the standard application line. A request id
  // quoted in the message body belongs to another invocation when either is present.
  /^\s*(?:START|END|REPORT)\s+RequestId:\s*([0-9a-fA-F-]{36})/,
  /^[^\t]+\t([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\t/,
  /RequestId:\s*([0-9a-fA-F-]{36})/,
];

/**
 * Extracts the Lambda `requestId` from a log message, trying the
 * `START`/`END`/`REPORT` lines first, then the standard tab-separated
 * application line prefix, then a generic inline `RequestId:`.
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
