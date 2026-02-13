import type { DynamoDBClient, QueryCommandInput, QueryCommandOutput } from '@aws-sdk/client-dynamodb';
import { QueryCommand, GetItemCommand, UpdateItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';

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
   *
   * @param tableName - Table name
   * @param keyConditionExpression - Key condition expression
   * @param expressionAttributeValues - Expression attribute values
   * @param expressionAttributeNames - Optional expression attribute names
   * @returns Array of unmarshalled items
   */
  async query(
    tableName: string,
    keyConditionExpression: string,
    expressionAttributeValues: Record<string, AttributeValue>,
    expressionAttributeNames?: Record<string, string>,
  ): Promise<ReadonlyArray<Record<string, unknown>>> {
    const items: Record<string, unknown>[] = [];
    let exclusiveStartKey: Record<string, AttributeValue> | undefined;

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

      const response: QueryCommandOutput = await this.client.send(new QueryCommand(input));

      if (response.Items) {
        for (const item of response.Items) {
          items.push(unmarshall(item));
        }
      }

      exclusiveStartKey = response.LastEvaluatedKey;
    } while (exclusiveStartKey !== undefined);

    return items;
  }

  /**
   * Gets a single item from DynamoDB.
   *
   * @param tableName - Table name
   * @param key - Item key as a plain object
   * @returns The unmarshalled item, or undefined if not found
   */
  async getItem(tableName: string, key: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
    const response = await this.client.send(
      new GetItemCommand({
        TableName: tableName,
        Key: marshall(key),
      }),
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
   */
  async updateItem(
    tableName: string,
    key: Record<string, unknown>,
    updateExpression: string,
    expressionAttributeValues: Record<string, unknown>,
    expressionAttributeNames?: Record<string, string>,
  ): Promise<void> {
    await this.client.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: marshall(key),
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: marshall(expressionAttributeValues),
        ExpressionAttributeNames: expressionAttributeNames,
      }),
    );
  }

  /**
   * Puts an item into DynamoDB.
   *
   * @param tableName - Table name
   * @param item - Item to put (plain object, auto-marshalled)
   */
  async putItem(tableName: string, item: Record<string, unknown>): Promise<void> {
    await this.client.send(
      new PutItemCommand({
        TableName: tableName,
        Item: marshall(item),
      }),
    );
  }
}
