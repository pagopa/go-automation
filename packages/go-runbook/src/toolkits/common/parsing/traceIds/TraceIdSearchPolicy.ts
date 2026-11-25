/**
 * Where a scanner looks for the trace id of a row:
 * - `field`: only the schema's trace-id field, as a direct id of a known format
 *   (X-Ray, compact or W3C, `FALLBACK-UUID:<uuid>`, `traceId:<uuid>`);
 * - `field-or-message`: also an X-Ray or `traceparent` header in that field, then
 *   an id the message fields name (an X-Ray id, a labeled 32-hex id, a
 *   `traceId:<uuid>`).
 */
export type TraceIdSearchPolicy = 'field' | 'field-or-message';
