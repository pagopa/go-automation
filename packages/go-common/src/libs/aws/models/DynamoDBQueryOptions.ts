/**
 * DynamoDB Query Options
 *
 * Configuration options for querying DynamoDB tables by partition key.
 */

/**
 * Supported DynamoDB scalar key types for partition/sort keys.
 * - 'S': String (default)
 * - 'N': Number (passed as decimal string)
 */
export type DynamoDBKeyType = 'S' | 'N';

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

  /** Partition key DynamoDB type (defaults to 'S'). Use 'N' for numeric keys. */
  readonly keyType?: DynamoDBKeyType | undefined;

  /** Optional prefix to prepend to key values (only valid when keyType is 'S') */
  readonly prefix?: string | undefined;

  /** Optional suffix to append to key values (only valid when keyType is 'S') */
  readonly suffix?: string | undefined;

  /** Optional name of the GSI/LSI to query */
  readonly indexName?: string | undefined;

  /** Optional sort key attribute name */
  readonly sortKeyName?: string | undefined;

  /** Optional sort key value (required if sortKeyName is provided) */
  readonly sortKeyValue?: string | undefined;

  /** Sort key DynamoDB type (defaults to 'S'). Use 'N' for numeric sort keys. */
  readonly sortKeyType?: DynamoDBKeyType | undefined;

  /** Optional list of attributes to return */
  readonly projection?: string[] | undefined;

  /** If true, returns raw DynamoDB AttributeValues instead of unmarshalled items */
  readonly isRaw?: boolean | undefined;
}
