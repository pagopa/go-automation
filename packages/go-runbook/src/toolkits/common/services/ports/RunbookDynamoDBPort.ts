import type { RunbookDynamoDBAttributeValue } from './RunbookDynamoDBAttributeValue.js';

/**
 * DynamoDB operations a runbook may use, without SDK types.
 *
 * `AWSDynamoDBService` (`@pagopa/go-aws/dynamodb`) satisfies it structurally,
 * so the engine's declaration files do not need `@aws-sdk/client-dynamodb`.
 */
export interface RunbookDynamoDBPort {
  /**
   * Queries a table with a key condition.
   *
   * @param tableName - Table name
   * @param keyConditionExpression - Key condition expression
   * @param expressionAttributeValues - Values bound to the expression placeholders
   * @param expressionAttributeNames - Names bound to the expression `#` aliases
   * @param maxItems - Maximum number of items
   * @param signal - Abort signal of the runbook execution
   * @returns The unmarshalled items
   */
  query(
    tableName: string,
    keyConditionExpression: string,
    expressionAttributeValues: Record<string, RunbookDynamoDBAttributeValue>,
    expressionAttributeNames?: Record<string, string>,
    maxItems?: number,
    signal?: AbortSignal,
  ): Promise<ReadonlyArray<Record<string, unknown>>>;

  /**
   * Reads one item by key.
   *
   * @param tableName - Table name
   * @param key - Item key
   * @param signal - Abort signal of the runbook execution
   * @returns The unmarshalled item, or `undefined` when missing
   */
  getItem(
    tableName: string,
    key: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown> | undefined>;

  /**
   * Updates one item.
   *
   * @param tableName - Table name
   * @param key - Item key
   * @param updateExpression - Update expression
   * @param expressionAttributeValues - Values bound to the expression placeholders
   * @param expressionAttributeNames - Names bound to the expression `#` aliases
   * @param signal - Abort signal of the runbook execution
   */
  updateItem(
    tableName: string,
    key: Record<string, unknown>,
    updateExpression: string,
    expressionAttributeValues: Record<string, unknown>,
    expressionAttributeNames?: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<void>;

  /**
   * Writes one item.
   *
   * @param tableName - Table name
   * @param item - Item to write
   * @param signal - Abort signal of the runbook execution
   */
  putItem(tableName: string, item: Record<string, unknown>, signal?: AbortSignal): Promise<void>;
}
