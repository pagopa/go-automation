import type { AttributeValue } from '@go-automation/go-common/aws';

/**
 * Structural contract for generic DynamoDB operations used by runbook steps.
 */
export interface DynamoDBOperationsService {
  query(
    tableName: string,
    keyConditionExpression: string,
    expressionAttributeValues: Record<string, AttributeValue>,
    expressionAttributeNames?: Record<string, string>,
    maxItems?: number,
    signal?: AbortSignal,
  ): Promise<ReadonlyArray<Record<string, unknown>>>;

  getItem(
    tableName: string,
    key: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown> | undefined>;

  updateItem(
    tableName: string,
    key: Record<string, unknown>,
    updateExpression: string,
    expressionAttributeValues: Record<string, unknown>,
    expressionAttributeNames?: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<void>;

  putItem(tableName: string, item: Record<string, unknown>, signal?: AbortSignal): Promise<void>;
}
