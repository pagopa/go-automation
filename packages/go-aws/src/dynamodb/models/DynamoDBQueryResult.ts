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

  /**
   * Query results.
   * By default items are unmarshalled objects; when `isRaw: true` is used,
   * items are raw DynamoDB AttributeValue maps.
   */
  readonly items: ReadonlyArray<T>;

  /** Number of items returned */
  readonly count: number;

  /**
   * Present when the query failed (only populated by `queryMultipleByPartitionKey`,
   * which captures per-key errors instead of aborting the whole batch).
   * When set, `items` is empty and `count` is 0.
   */
  readonly error?: Error;
}
