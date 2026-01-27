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
} from '@aws-sdk/client-dynamodb';
import { QueryCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';

import type { DynamoDBQueryOptions } from './models/DynamoDBQueryOptions.js';
import type { DynamoDBQueryResult } from './models/DynamoDBQueryResult.js';

/** Chunk size for concurrent requests */
const CHUNK_SIZE = 10;

/**
 * Progress callback for batch operations
 *
 * @param current - Number of items processed so far
 * @param total - Total number of items to process
 */
export type DynamoDBQueryProgressCallback = (current: number, total: number) => void;

/**
 * Generic service for querying DynamoDB tables by partition key.
 *
 * Features:
 * - Query by partition key with configurable table/key names
 * - Optional prefix/suffix for key values
 * - Automatic unmarshalling of DynamoDB items
 * - Automatic pagination handling
 * - Concurrent batch queries with progress callback
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
 * ```
 */
export class DynamoDBQueryService {
  constructor(private readonly client: DynamoDBClient) {}

  /**
   * Queries a DynamoDB table by partition key
   *
   * Handles pagination automatically and unmarshalls all items.
   * Complexity: O(N) where N is the number of items returned
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
  async queryByPartitionKey<T = Record<string, unknown>>(
    keyValue: string,
    options: DynamoDBQueryOptions,
  ): Promise<DynamoDBQueryResult<T>> {
    const fullKey = this.buildFullKey(keyValue, options);
    const items: T[] = [];

    let exclusiveStartKey: Record<string, AttributeValue> | undefined;

    // Paginate through all results
    do {
      const input: QueryCommandInput = {
        TableName: options.tableName,
        KeyConditionExpression: '#pk = :val',
        ExpressionAttributeNames: {
          '#pk': options.keyName,
        },
        ExpressionAttributeValues: {
          ':val': { S: fullKey },
        },
        ExclusiveStartKey: exclusiveStartKey,
      };

      const command = new QueryCommand(input);
      const response: QueryCommandOutput = await this.client.send(command);

      // Unmarshall and collect items
      if (response.Items) {
        for (const item of response.Items) {
          items.push(unmarshall(item) as T);
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
   * Queries a DynamoDB table for multiple partition keys
   *
   * Uses Promise.all with chunking for controlled concurrency (10 concurrent requests).
   * Complexity: O(N) where N is the number of key values
   *
   * @typeParam T - The expected type of items (defaults to generic record)
   * @param keyValues - Array of partition key values to query
   * @param options - Query options including table name, key name, and optional prefix/suffix
   * @param onProgress - Optional callback for progress updates
   * @returns Array of query results
   *
   * @example
   * ```typescript
   * const results = await service.queryMultipleByPartitionKey(
   *   ['key1', 'key2', 'key3'],
   *   { tableName: 'my-table', keyName: 'pk' },
   *   (current, total) => console.log(`${current}/${total}`),
   * );
   * ```
   */
  async queryMultipleByPartitionKey<T = Record<string, unknown>>(
    keyValues: ReadonlyArray<string>,
    options: DynamoDBQueryOptions,
    onProgress?: DynamoDBQueryProgressCallback,
  ): Promise<ReadonlyArray<DynamoDBQueryResult<T>>> {
    const total = keyValues.length;
    const results: DynamoDBQueryResult<T>[] = [];
    let processed = 0;

    // Process in chunks of CHUNK_SIZE
    for (let i = 0; i < keyValues.length; i += CHUNK_SIZE) {
      const chunk = keyValues.slice(i, i + CHUNK_SIZE);

      const chunkResults = await Promise.all(
        chunk.map(async (keyValue) => this.queryByPartitionKey<T>(keyValue, options)),
      );

      results.push(...chunkResults);
      processed += chunk.length;

      if (onProgress) {
        onProgress(processed, total);
      }
    }

    return results;
  }

  /**
   * Builds the full key value with optional prefix and suffix
   *
   * @param keyValue - The base key value
   * @param options - Options containing optional prefix/suffix
   * @returns The full key value
   */
  private buildFullKey(keyValue: string, options: DynamoDBQueryOptions): string {
    const prefix = options.prefix ?? '';
    const suffix = options.suffix ?? '';
    return `${prefix}${keyValue}${suffix}`;
  }
}
