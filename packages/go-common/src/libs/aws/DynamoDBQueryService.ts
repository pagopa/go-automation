/**
 * DynamoDB Query Service
 *
 * Generic service for querying DynamoDB tables by partition key.
 * Supports prefix/suffix on keys, automatic unmarshalling, and pagination.
 */

import type {
  DynamoDBClient,
  QueryCommandInput,
  QueryCommandOutput,
  TableStatus,
  TableDescription,
} from '@aws-sdk/client-dynamodb';
import { QueryCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';

import type { DynamoDBQueryOptions, DynamoDBKeyType } from './models/DynamoDBQueryOptions.js';
import type { DynamoDBQueryResult } from './models/DynamoDBQueryResult.js';

/** Maximum number of concurrent in-flight queries in the worker pool */
const MAX_CONCURRENCY = 10;

/** Raw DynamoDB item shape (before unmarshalling) */
type RawItem = Record<string, AttributeValue>;

/**
 * Progress handler for batch operations
 *
 * @param current - Number of items processed so far
 * @param total - Total number of items to process
 */
export type DynamoDBQueryProgressHandler = (current: number, total: number) => void;

/**
 * Generic service for querying DynamoDB tables by partition key.
 *
 * Features:
 * - Query by partition key with configurable table/key names
 * - Optional prefix/suffix for key values (string keys only)
 * - Numeric partition/sort keys via `keyType`/`sortKeyType: 'N'`
 * - Automatic unmarshalling of DynamoDB items (or raw passthrough via `isRaw: true`)
 * - Automatic pagination handling
 * - Concurrent batch queries with progress updates
 *
 * @example
 * ```typescript
 * import { Core } from '@go-automation/go-common';
 *
 * const queryService = new Core.DynamoDBQueryService(script.aws.dynamoDB);
 *
 * // Simple query
 * const result = await queryService.queryByPartitionKey('IUN-123', {
 *   tableName: 'pn-Timelines',
 *   keyName: 'iun',
 * });
 *
 * // Query with prefix/suffix
 * const result2 = await queryService.queryByPartitionKey('12345', {
 *   tableName: 'pn-Notifications',
 *   keyName: 'pk',
 *   prefix: 'NOTIF##',
 *   suffix: '##v1',
 * });
 * // fullKey = "NOTIF##12345##v1"
 *
 * // Numeric partition key
 * const result3 = await queryService.queryByPartitionKey('42', {
 *   tableName: 'pn-Counters',
 *   keyName: 'id',
 *   keyType: 'N',
 * });
 * ```
 */
export class DynamoDBQueryService {
  constructor(private readonly client: DynamoDBClient) {}

  /**
   * Retrieves the current status of a DynamoDB table
   *
   * @param tableName - Name of the table to check
   * @returns The table status (e.g., 'ACTIVE') or undefined if not found
   */
  async getTableStatus(tableName: string): Promise<TableStatus | undefined> {
    const command = new DescribeTableCommand({ TableName: tableName });
    const response = await this.client.send(command);
    return response.Table?.TableStatus;
  }

  /**
   * Retrieves the full description of a DynamoDB table
   *
   * @param tableName - Name of the table to describe
   * @returns The table description or undefined if not found
   */
  async describeTable(tableName: string): Promise<TableDescription | undefined> {
    const command = new DescribeTableCommand({ TableName: tableName });
    const response = await this.client.send(command);
    return response.Table;
  }

  /**
   * Queries a DynamoDB table by partition key returning raw AttributeValue items.
   *
   * Selected when `options.isRaw` is the literal `true`.
   */
  queryByPartitionKey(
    keyValue: string,
    options: DynamoDBQueryOptions & { readonly isRaw: true },
  ): Promise<DynamoDBQueryResult<RawItem>>;

  /**
   * Queries a DynamoDB table by partition key returning unmarshalled items typed as T.
   *
   * Handles pagination automatically and unmarshalls all items.
   * Complexity: O(N) where N is the number of items returned.
   *
   * @typeParam T - The expected type of items (defaults to generic record)
   * @param keyValue - The partition key value (without prefix/suffix)
   * @param options - Query options including table name, key name, and optional prefix/suffix
   * @returns Query result with unmarshalled items
   *
   * @example
   * ```typescript
   * interface MyItem {
   *   readonly id: string;
   *   readonly status: string;
   * }
   *
   * const result = await service.queryByPartitionKey<MyItem>('key1', {
   *   tableName: 'my-table',
   *   keyName: 'pk',
   * });
   * // result.items is ReadonlyArray<MyItem>
   * ```
   */
  queryByPartitionKey<T = Record<string, unknown>>(
    keyValue: string,
    options: DynamoDBQueryOptions,
  ): Promise<DynamoDBQueryResult<T>>;

  async queryByPartitionKey<T = Record<string, unknown>>(
    keyValue: string,
    options: DynamoDBQueryOptions,
  ): Promise<DynamoDBQueryResult<T>> {
    this.validateOptions(options);

    const fullKey = this.buildFullKey(keyValue, options);
    const pkValue = this.buildAttributeValue(fullKey, options.keyType);
    const expressionNames: Record<string, string> = { '#pk': options.keyName };
    const expressionValues: Record<string, AttributeValue> = { ':pkVal': pkValue };

    let keyCondition = '#pk = :pkVal';

    if (options.sortKeyName !== undefined && options.sortKeyValue !== undefined) {
      expressionNames['#sk'] = options.sortKeyName;
      expressionValues[':skVal'] = this.buildAttributeValue(options.sortKeyValue, options.sortKeyType);
      keyCondition += ' AND #sk = :skVal';
    }

    // Build projection alias map AND expression in a single pass
    let projectionExpression: string | undefined;
    if (options.projection) {
      const aliases: string[] = [];
      for (const [idx, attr] of options.projection.entries()) {
        const alias = `#attr${idx}`;
        expressionNames[alias] = attr;
        aliases.push(alias);
      }
      projectionExpression = aliases.join(', ');
    }

    // Pick the per-item transform once (avoids the isRaw branch in the hot loop)
    const transform: (item: RawItem) => T = options.isRaw ? (item) => item as T : (item) => unmarshall(item) as T;

    const items: T[] = [];
    let exclusiveStartKey: Record<string, AttributeValue> | undefined;

    do {
      const input: QueryCommandInput = {
        TableName: options.tableName,
        KeyConditionExpression: keyCondition,
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues,
        ...(options.indexName !== undefined && { IndexName: options.indexName }),
        ...(projectionExpression !== undefined && { ProjectionExpression: projectionExpression }),
        ...(exclusiveStartKey !== undefined && { ExclusiveStartKey: exclusiveStartKey }),
      };

      const command = new QueryCommand(input);
      const response: QueryCommandOutput = await this.client.send(command);

      if (response.Items) {
        for (const item of response.Items) {
          items.push(transform(item));
        }
      }

      exclusiveStartKey = response.LastEvaluatedKey;
    } while (exclusiveStartKey !== undefined);

    return {
      keyValue,
      fullKey,
      items,
      count: items.length,
    };
  }

  /**
   * Queries a DynamoDB table for multiple partition keys returning raw AttributeValue items.
   *
   * Selected when `options.isRaw` is the literal `true`.
   */
  queryMultipleByPartitionKey(
    keyValues: ReadonlyArray<string>,
    options: DynamoDBQueryOptions & { readonly isRaw: true },
    onProgress?: DynamoDBQueryProgressHandler,
  ): Promise<ReadonlyArray<DynamoDBQueryResult<RawItem>>>;

  /**
   * Queries a DynamoDB table for multiple partition keys returning unmarshalled items typed as T.
   *
   * Uses a worker pool with constant concurrency (up to {@link MAX_CONCURRENCY} in-flight
   * requests): as soon as a query finishes, the worker picks up the next pending key.
   * This avoids the chunk-barrier of `Promise.all`-on-batches where one slow key would
   * stall the rest of its batch.
   *
   * Per-key errors are captured into the result's `error` field instead of aborting the
   * whole batch — the caller is responsible for inspecting `result.error` to surface
   * failures. Misconfiguration (caught by {@link validateOptions}) still throws upfront.
   *
   * Complexity: O(N) where N is the number of key values.
   *
   * @typeParam T - The expected type of items (defaults to generic record)
   * @param keyValues - Array of partition key values to query
   * @param options - Query options including table name, key name, and optional prefix/suffix
   * @param onProgress - Optional handler for progress updates
   * @returns Array of query results, in the same order as `keyValues`
   *
   * @example
   * ```typescript
   * const results = await service.queryMultipleByPartitionKey(
   *   ['key1', 'key2', 'key3'],
   *   { tableName: 'my-table', keyName: 'pk' },
   *   (current, total) => console.log(`${current}/${total}`),
   * );
   *
   * for (const result of results) {
   *   if (result.error) {
   *     console.error(`Failed ${result.keyValue}: ${result.error.message}`);
   *     continue;
   *   }
   *   // process result.items
   * }
   * ```
   */
  queryMultipleByPartitionKey<T = Record<string, unknown>>(
    keyValues: ReadonlyArray<string>,
    options: DynamoDBQueryOptions,
    onProgress?: DynamoDBQueryProgressHandler,
  ): Promise<ReadonlyArray<DynamoDBQueryResult<T>>>;

  async queryMultipleByPartitionKey<T = Record<string, unknown>>(
    keyValues: ReadonlyArray<string>,
    options: DynamoDBQueryOptions,
    onProgress?: DynamoDBQueryProgressHandler,
  ): Promise<ReadonlyArray<DynamoDBQueryResult<T>>> {
    const total = keyValues.length;
    if (total === 0) {
      return [];
    }

    // Fail-fast on misconfiguration so we don't produce N identical config-error results.
    this.validateOptions(options);

    const resultsByIdx = new Map<number, DynamoDBQueryResult<T>>();
    let nextIndex = 0;
    let processed = 0;

    const worker = async (): Promise<void> => {
      while (true) {
        const idx = nextIndex++;
        if (idx >= total) {
          return;
        }
        const keyValue = keyValues[idx];
        if (keyValue === undefined) {
          return;
        }

        let result: DynamoDBQueryResult<T>;
        try {
          result = await this.queryByPartitionKey<T>(keyValue, options);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          result = {
            keyValue,
            fullKey: this.buildFullKey(keyValue, options),
            items: [],
            count: 0,
            error,
          };
        }

        resultsByIdx.set(idx, result);
        processed++;
        onProgress?.(processed, total);
      }
    };

    const concurrency = Math.min(MAX_CONCURRENCY, total);
    const workers: Promise<void>[] = [];
    for (let i = 0; i < concurrency; i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    // Reassemble in original key order. By construction, every idx in [0, total) was assigned.
    const results: DynamoDBQueryResult<T>[] = [];
    for (let i = 0; i < total; i++) {
      const result = resultsByIdx.get(i);
      if (result === undefined) {
        throw new Error(`DynamoDBQueryService: missing worker result at index ${i}`);
      }
      results.push(result);
    }

    return results;
  }

  /**
   * Validates query options that can only be checked at runtime.
   *
   * @throws Error if sortKeyName/sortKeyValue are not both provided or both omitted,
   *         or if prefix/suffix are used with a non-string partition key type.
   */
  private validateOptions(options: DynamoDBQueryOptions): void {
    if ((options.sortKeyName === undefined) !== (options.sortKeyValue === undefined)) {
      throw new Error('DynamoDBQueryOptions: sortKeyName and sortKeyValue must be provided together');
    }
    if (options.keyType === 'N' && (options.prefix !== undefined || options.suffix !== undefined)) {
      throw new Error("DynamoDBQueryOptions: prefix/suffix are only supported when keyType is 'S'");
    }
  }

  /**
   * Builds the full key value with optional prefix and suffix.
   * Prefix/suffix are skipped for non-string key types (validation enforces they're undefined).
   */
  private buildFullKey(keyValue: string, options: DynamoDBQueryOptions): string {
    const prefix = options.prefix ?? '';
    const suffix = options.suffix ?? '';
    return `${prefix}${keyValue}${suffix}`;
  }

  /**
   * Builds a DynamoDB AttributeValue for a key value of the given type.
   *
   * @param value - The string representation of the key value
   * @param type - The DynamoDB scalar type (defaults to 'S')
   */
  private buildAttributeValue(value: string, type: DynamoDBKeyType | undefined): AttributeValue {
    return type === 'N' ? { N: value } : { S: value };
  }
}
