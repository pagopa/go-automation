import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import { interpolateTemplate } from './interpolateTemplate.js';

/**
 * Configuration for the DynamoDB query data step.
 */
export interface DynamoDBQueryConfig {
  /** Unique step identifier */
  readonly id: string;
  /** Human-readable label for logs and UI */
  readonly label: string;
  /** DynamoDB table name (supports {{params.xxx}} and {{vars.xxx}} templates) */
  readonly tableName: string;
  /** Key condition expression (supports {{params.xxx}} and {{vars.xxx}} templates) */
  readonly keyConditionExpression: string;
  /** Expression attribute values for the key condition */
  readonly expressionAttributeValues: Readonly<Record<string, AttributeValue>>;
  /** Optional expression attribute names for reserved word handling */
  readonly expressionAttributeNames?: Readonly<Record<string, string>>;
}

/**
 * Data step that queries a DynamoDB table using a key condition expression.
 * Supports template interpolation in the table name and key condition expression.
 *
 * @example
 * ```typescript
 * const step = queryDynamoDB({
 *   id: 'fetch-notifications',
 *   label: 'Fetch notifications by IUN',
 *   tableName: 'pn-Notifications',
 *   keyConditionExpression: 'iun = :iun',
 *   expressionAttributeValues: { ':iun': { S: '{{params.iun}}' } },
 * });
 * ```
 */
export class DynamoDBQueryStep implements Step<ReadonlyArray<Record<string, unknown>>> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly tableName: string;
  private readonly keyConditionExpression: string;
  private readonly expressionAttributeValues: Readonly<Record<string, AttributeValue>>;
  private readonly expressionAttributeNames: Readonly<Record<string, string>> | undefined;

  constructor(config: DynamoDBQueryConfig) {
    this.id = config.id;
    this.label = config.label;
    this.tableName = config.tableName;
    this.keyConditionExpression = config.keyConditionExpression;
    this.expressionAttributeValues = config.expressionAttributeValues;
    this.expressionAttributeNames = config.expressionAttributeNames;
  }

  /**
   * Executes a DynamoDB query with the configured key condition.
   *
   * @param context - The runbook execution context
   * @returns Step result containing an array of unmarshalled DynamoDB items
   */
  async execute(context: RunbookContext): Promise<StepResult<ReadonlyArray<Record<string, unknown>>>> {
    try {
      const resolvedTableName = interpolateTemplate(this.tableName, context);
      const resolvedExpression = interpolateTemplate(this.keyConditionExpression, context);
      const resolvedValues = resolveAttributeValues(this.expressionAttributeValues, context);

      const results = await context.services.dynamodb.query(
        resolvedTableName,
        resolvedExpression,
        resolvedValues,
        this.expressionAttributeNames !== undefined ? { ...this.expressionAttributeNames } : undefined,
      );

      return { success: true, output: results };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `DynamoDB query failed: ${message}` };
    }
  }
}

/**
 * Resolves template placeholders inside string-typed DynamoDB attribute values (S type).
 * Non-string attribute values are passed through unchanged.
 */
function resolveAttributeValues(
  values: Readonly<Record<string, AttributeValue>>,
  context: RunbookContext,
): Record<string, AttributeValue> {
  const resolved: Record<string, AttributeValue> = {};
  for (const [key, attr] of Object.entries(values)) {
    if ('S' in attr && typeof attr.S === 'string') {
      resolved[key] = { ...attr, S: interpolateTemplate(attr.S, context) };
    } else {
      resolved[key] = attr;
    }
  }
  return resolved;
}

/**
 * Factory function for creating a DynamoDB query data step.
 *
 * @param config - Step configuration
 * @returns A new DynamoDBQueryStep instance
 */
export function queryDynamoDB(config: DynamoDBQueryConfig): DynamoDBQueryStep {
  return new DynamoDBQueryStep(config);
}
