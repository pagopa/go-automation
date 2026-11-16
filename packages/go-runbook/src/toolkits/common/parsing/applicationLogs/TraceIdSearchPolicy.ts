/**
 * Where a scanner looks for the trace id of a row (EVO-RBREORG-OPUS-01 P32):
 * - `field`: only the schema's trace-id field, as a raw or canonical X-Ray id;
 * - `field-or-message`: also an X-Ray header in that field, then an X-Ray id or
 *   a labeled 32-hex id in the message fields.
 */
export type TraceIdSearchPolicy = 'field' | 'field-or-message';
