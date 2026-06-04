/**
 * Canonical CloudWatch Logs Insights query that scans a Lambda log group
 * for the most frequent error signatures: application `ERROR` lines, runtime
 * timeouts, out-of-memory, and the runtime `REPORT ... Status: error` line.
 *
 * The last filter is case-insensitive because a failed invocation may surface
 * only as `Status: error` on the REPORT line, without an uppercase `ERROR`
 * application line (the `ERROR` substring match is case-sensitive). `limit`
 * bounds the result size.
 */
export const DEFAULT_LAMBDA_ERROR_QUERY: string = `fields @timestamp, @message, @requestId
| filter @message like 'ERROR'
    or @message like /(?i)timed?\\s*out/
    or @message like /(?i)OutOfMemory/
    or @message like /(?i)Status:\\s*error/
| sort @timestamp desc
| limit 1000`;
