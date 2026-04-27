/**
 * Single failed-query record produced by `queryAllKeys` and persisted to `failures.json`.
 */
export interface QueryFailure {
  /** Original partition key value as supplied by the caller */
  readonly keyValue: string;

  /** Full key with prefix/suffix applied (what was actually sent to DynamoDB) */
  readonly fullKey: string;

  /** Error message captured from the underlying query failure */
  readonly error: string;
}
