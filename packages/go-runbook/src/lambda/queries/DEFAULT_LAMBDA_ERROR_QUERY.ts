/**
 * Canonical CloudWatch Logs Insights query that scans a Lambda log group
 * for the three most frequent error signatures: application `ERROR` lines,
 * runtime timeouts and out-of-memory. `limit` bounds the result size.
 */
export const DEFAULT_LAMBDA_ERROR_QUERY: string = `fields @timestamp, @message
| filter @message like 'ERROR'
    or @message like /(?i)timed?\\s*out/
    or @message like /(?i)OutOfMemory/
| sort @timestamp desc
| limit 1000`;
