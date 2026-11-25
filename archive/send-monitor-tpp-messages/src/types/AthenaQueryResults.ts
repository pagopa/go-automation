import type { AthenaResultSet } from './AthenaResultSet.js';

/**
 * Represents the results returned from an Athena query execution
 */
export interface AthenaQueryResults {
  readonly ResultSet: AthenaResultSet;
  readonly NextToken?: string;
}
