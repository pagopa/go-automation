import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import type { RunbookContext } from '../../types/RunbookContext.js';

/**
 * Configuration for the DynamoDB put step.
 */
export interface DynamoDBPutConfig {
  /** Unique step identifier */
  readonly id: string;
  /** Human-readable label for logs and UI */
  readonly label: string;
  /** DynamoDB table name */
  readonly tableName: string;
  /** Item to put as a plain object (auto-marshalled) */
  readonly item: Readonly<Record<string, unknown>>;
}

/**
 * Mutation step that puts an item into a DynamoDB table.
 * Delegates to the context's DynamoDB service for marshalling and execution.
 *
 * @example
 * ```typescript
 * const step = dynamoDBPut({
 *   id: 'insert-record',
 *   label: 'Insert audit record',
 *   tableName: 'pn-audit-log',
 *   item: { pk: 'AUDIT#001', action: 'resolve', timestamp: '2025-01-01T00:00:00Z' },
 * });
 * ```
 */
class DynamoDBPutStep implements Step<void> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'mutation';

  private readonly tableName: string;
  private readonly item: Readonly<Record<string, unknown>>;

  constructor(config: DynamoDBPutConfig) {
    this.id = config.id;
    this.label = config.label;
    this.tableName = config.tableName;
    this.item = config.item;
  }

  /**
   * Executes the DynamoDB put operation.
   *
   * @param context - The runbook execution context
   * @returns Step result indicating success or failure
   */
  async execute(context: RunbookContext): Promise<StepResult<void>> {
    try {
      await context.services.dynamodb.putItem(this.tableName, { ...this.item });

      return { success: true, output: undefined };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `DynamoDB put failed: ${message}` };
    }
  }
}

/**
 * Factory function for creating a DynamoDB put mutation step.
 *
 * @param config - Step configuration
 * @returns A new DynamoDBPutStep instance
 */
export function dynamoDBPut(config: DynamoDBPutConfig): Step<void> {
  return new DynamoDBPutStep(config);
}
