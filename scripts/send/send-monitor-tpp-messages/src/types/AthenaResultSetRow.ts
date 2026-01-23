/**
 * Represents a single row in an Athena result set
 */
export interface AthenaResultSetRow {
  readonly Data: ReadonlyArray<{ readonly VarCharValue?: string }>;
}
