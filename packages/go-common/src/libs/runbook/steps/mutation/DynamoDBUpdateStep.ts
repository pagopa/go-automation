import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import type { RunbookContext } from '../../types/RunbookContext.js';

/**
 * Configuration for the DynamoDB update step.
 */
export interface DynamoDBUpdateConfig {
  /** Unique step identifier */
  readonly id: string;
  /** Human-readable label for logs and UI */
  readonly label: string;
  /** DynamoDB table name */
  readonly tableName: string;
  /** Item key as a plain object (auto-marshalled) */
  readonly key: Readonly<Record<string, unknown>>;
  /** DynamoDB update expression (e.g. "SET #s = :val") */
  readonly updateExpression: string;
  /** Expression attribute values as plain objects (auto-marshalled) */
  readonly expressionAttributeValues: Readonly<Record<string, unknown>>;
  /** Optional expression attribute names for reserved word handling */
  readonly expressionAttributeNames?: Readonly<Record<string, string>>;
}

/**
 * Mutation step that updates an item in a DynamoDB table.
 * Delegates to the context's DynamoDB service for marshalling and execution.
 *
 * @example
 * ```typescript
 * const step = dynamoDBUpdate({
 *   id: 'update-status',
 *   label: 'Update item status to resolved',
 *   tableName: 'pn-notifications',
 *   key: { pk: 'NOTIF#123' },
 *   updateExpression: 'SET #s = :status',
 *   expressionAttributeValues: { ':status': 'RESOLVED' },
 *   expressionAttributeNames: { '#s': 'status' },
 * });
 * ```
 */
class DynamoDBUpdateStep implements Step<void> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'mutation';

  private readonly tableName: string;
  private readonly key: Readonly<Record<string, unknown>>;
  private readonly updateExpression: string;
  private readonly expressionAttributeValues: Readonly<Record<string, unknown>>;
  private readonly expressionAttributeNames: Readonly<Record<string, string>> | undefined;

  constructor(config: DynamoDBUpdateConfig) {
    this.id = config.id;
    this.label = config.label;
    this.tableName = config.tableName;
    this.key = config.key;
    this.updateExpression = config.updateExpression;
    this.expressionAttributeValues = config.expressionAttributeValues;
    this.expressionAttributeNames = config.expressionAttributeNames;
  }

  /**
   * Executes the DynamoDB update operation.
   *
   * @param context - The runbook execution context
   * @returns Step result indicating success or failure
   */
  async execute(context: RunbookContext): Promise<StepResult<void>> {
    try {
      await context.services.dynamodb.updateItem(
        this.tableName,
        { ...this.key },
        this.updateExpression,
        { ...this.expressionAttributeValues },
        this.expressionAttributeNames !== undefined ? { ...this.expressionAttributeNames } : undefined,
      );

      return { success: true, output: undefined };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `DynamoDB update failed: ${message}` };
    }
  }
}

/**
 * Factory function for creating a DynamoDB update mutation step.
 *
 * @param config - Step configuration
 * @returns A new DynamoDBUpdateStep instance
 */
export function dynamoDBUpdate(config: DynamoDBUpdateConfig): Step<void> {
  return new DynamoDBUpdateStep(config);
}
