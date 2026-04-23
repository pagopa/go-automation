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
  readonly prefix?: string | undefined;

  /** Optional suffix to append to key values */
  readonly suffix?: string | undefined;

  /** Optional name of the GSI/LSI to query */
  readonly indexName?: string | undefined;

  /** Optional sort key attribute name */
  readonly sortKeyName?: string | undefined;

  /** Optional sort key value (required if sortKeyName is provided) */
  readonly sortKeyValue?: string | undefined;

  /** Optional list of attributes to return */
  readonly projection?: string[] | undefined;

  /** If true, returns raw DynamoDB AttributeValues instead of unmarshalled items */
  readonly isRaw?: boolean | undefined;
}
