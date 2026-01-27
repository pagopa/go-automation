/**
 * DynamoDB Query Result
 *
 * Result structure for DynamoDB partition key queries.
 */

/**
 * Result of a DynamoDB partition key query
 *
 * @typeParam T - The type of items in the result (defaults to generic record)
 *
 * @example
 * ```typescript
 * const result: DynamoDBQueryResult<MyItem> = {
 *   keyValue: '12345',
 *   fullKey: 'PREFIX##12345##SUFFIX',
 *   items: [{ id: '12345', status: 'active' }],
 *   count: 1,
 * };
 * ```
 */
export interface DynamoDBQueryResult<T = Record<string, unknown>> {
  /** The original key value (without prefix/suffix) */
  readonly keyValue: string;

  /** The full key with prefix/suffix applied */
  readonly fullKey: string;

  /** Query results (unmarshalled from DynamoDB format) */
  readonly items: ReadonlyArray<T>;

  /** Number of items returned */
  readonly count: number;
}
