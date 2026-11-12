/**
 * Deterministic idempotency keys of a row (§6.3).
 */
export interface RowIdentifiers {
  readonly paProtocolNumber: string;
  readonly idempotenceToken: string;
}
