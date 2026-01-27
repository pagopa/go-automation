/**
 * DynamoDB Query Options
 *
 * Configuration options for querying DynamoDB tables by partition key.
 */

/**
 * Options for DynamoDB partition key queries
 *
 * @example
 * ```typescript
 * const options: DynamoDBQueryOptions = {
 *   tableName: 'pn-Notifications',
 *   keyName: 'pk',
 *   prefix: 'NOTIF##',
 *   suffix: '##v1',
 * };
 * ```
 */
export interface DynamoDBQueryOptions {
  /** DynamoDB table name */
  readonly tableName: string;

  /** Partition key attribute name */
  readonly keyName: string;

  /** Optional prefix to prepend to key values */
  readonly prefix?: string;

  /** Optional suffix to append to key values */
  readonly suffix?: string;
}
