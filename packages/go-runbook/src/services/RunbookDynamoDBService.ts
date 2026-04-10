import type { DynamoDBClient, QueryCommandInput, QueryCommandOutput } from '@aws-sdk/client-dynamodb';
import { QueryCommand, GetItemCommand, UpdateItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';

/** Default maximum number of items returned by a query to prevent unbounded memory growth. */
const DEFAULT_MAX_ITEMS = 10_000;

/**
 * DynamoDB service wrapper for runbook steps.
 * Provides query, get, update, and put operations.
 *
 * @example
 * ```typescript
 * const service = new RunbookDynamoDBService(client);
 * const items = await service.query('my-table', 'pk = :val', { ':val': { S: 'KEY' } });
 * ```
 */
export class RunbookDynamoDBService {
  constructor(private readonly client: DynamoDBClient) {}

  /**
   * Queries a DynamoDB table with automatic pagination.
   * Stops after `maxItems` to prevent unbounded memory growth on large result sets.
   *
   * @param tableName - Table name
   * @param keyConditionExpression - Key condition expression
   * @param expressionAttributeValues - Expression attribute values
   * @param expressionAttributeNames - Optional expression attribute names
   * @param maxItems - Maximum items to return (default 10,000)
   * @param signal - Optional abort signal to cancel the query
   * @returns Array of unmarshalled items
   */
  async query(
    tableName: string,
    keyConditionExpression: string,
    expressionAttributeValues: Record<string, AttributeValue>,
    expressionAttributeNames?: Record<string, string>,
    maxItems: number = DEFAULT_MAX_ITEMS,
    signal?: AbortSignal,
  ): Promise<ReadonlyArray<Record<string, unknown>>> {
    const items: Record<string, unknown>[] = [];
    let exclusiveStartKey: Record<string, AttributeValue> | undefined;
    const sendOptions = signal !== undefined ? { abortSignal: signal } : undefined;

    do {
      const input: QueryCommandInput = {
        TableName: tableName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExclusiveStartKey: exclusiveStartKey,
      };

      if (expressionAttributeNames !== undefined) {
        input.ExpressionAttributeNames = expressionAttributeNames;
      }

      const response: QueryCommandOutput = await this.client.send(new QueryCommand(input), sendOptions);

      if (response.Items) {
        for (const item of response.Items) {
          items.push(unmarshall(item));
        }
      }

      exclusiveStartKey = response.LastEvaluatedKey;
    } while (exclusiveStartKey !== undefined && items.length < maxItems);

    return items;
  }

  /**
   * Gets a single item from DynamoDB.
   *
   * @param tableName - Table name
   * @param key - Item key as a plain object
   * @param signal - Optional abort signal to cancel the request
   * @returns The unmarshalled item, or undefined if not found
   */
  async getItem(
    tableName: string,
    key: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown> | undefined> {
    const response = await this.client.send(
      new GetItemCommand({
        TableName: tableName,
        Key: marshall(key),
      }),
      ...(signal !== undefined ? [{ abortSignal: signal }] : []),
    );

    if (response.Item === undefined) {
      return undefined;
    }

    return unmarshall(response.Item);
  }

  /**
   * Updates an item in DynamoDB.
   *
   * @param tableName - Table name
   * @param key - Item key as a plain object
   * @param updateExpression - Update expression
   * @param expressionAttributeValues - Expression attribute values (plain objects, auto-marshalled)
   * @param expressionAttributeNames - Optional expression attribute names
   * @param signal - Optional abort signal to cancel the request
   */
  async updateItem(
    tableName: string,
    key: Record<string, unknown>,
    updateExpression: string,
    expressionAttributeValues: Record<string, unknown>,
    expressionAttributeNames?: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.client.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: marshall(key),
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: marshall(expressionAttributeValues),
        ExpressionAttributeNames: expressionAttributeNames,
      }),
      ...(signal !== undefined ? [{ abortSignal: signal }] : []),
    );
  }

  /**
   * Puts an item into DynamoDB.
   *
   * @param tableName - Table name
   * @param item - Item to put (plain object, auto-marshalled)
   * @param signal - Optional abort signal to cancel the request
   */
  async putItem(tableName: string, item: Record<string, unknown>, signal?: AbortSignal): Promise<void> {
    await this.client.send(
      new PutItemCommand({
        TableName: tableName,
        Item: marshall(item),
      }),
      ...(signal !== undefined ? [{ abortSignal: signal }] : []),
    );
  }
}
