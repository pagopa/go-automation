import type { AthenaResultSetRow } from './AthenaResultSetRow.js';

/**
 * Represents the complete result set from an Athena query
 */
export interface AthenaResultSet {
  readonly Rows: readonly AthenaResultSetRow[];
  readonly ResultSetMetadata?: {
    readonly ColumnInfo: readonly unknown[];
  };
}
