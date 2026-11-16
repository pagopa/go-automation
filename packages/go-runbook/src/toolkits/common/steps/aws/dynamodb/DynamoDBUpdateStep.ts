import type { Step } from '../../../../../engine/types/Step.js';
import type { StepKind } from '../../../../../engine/types/StepKind.js';
import type { StepResult } from '../../../../../engine/types/StepResult.js';
import { throwIfRunbookAborted } from '../../../../../engine/context/throwIfRunbookAborted.js';
import { OperationalStep } from '../../OperationalStep.js';
import type { OperationalContext } from '../../../services/OperationalContext.js';
import type { OperationalServiceName } from '../../../services/OperationalServiceName.js';

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
 * const step = new DynamoDBUpdateStep({
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
export class DynamoDBUpdateStep extends OperationalStep<void> implements Step<void> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'mutation';

  private readonly tableName: string;
  private readonly key: Readonly<Record<string, unknown>>;
  private readonly updateExpression: string;
  private readonly expressionAttributeValues: Readonly<Record<string, unknown>>;
  private readonly expressionAttributeNames: Readonly<Record<string, string>> | undefined;

  constructor(config: DynamoDBUpdateConfig) {
    super();
    this.id = config.id;
    this.label = config.label;
    this.tableName = config.tableName;
    this.key = config.key;
    this.updateExpression = config.updateExpression;
    this.expressionAttributeValues = config.expressionAttributeValues;
    this.expressionAttributeNames = config.expressionAttributeNames;
  }

  /**
   * Operational services this step uses.
   *
   * @returns The required service names
   */
  override requiredServices(): ReadonlyArray<OperationalServiceName> {
    return ['dynamodb'];
  }

  /**
   * Executes the DynamoDB update operation.
   *
   * @param context - The runbook execution context
   * @returns Step result indicating success or failure
   */
  override async execute(context: OperationalContext): Promise<StepResult<void>> {
    try {
      throwIfRunbookAborted(context);
      await context.services.dynamodb.updateItem(
        this.tableName,
        { ...this.key },
        this.updateExpression,
        { ...this.expressionAttributeValues },
        this.expressionAttributeNames !== undefined ? { ...this.expressionAttributeNames } : undefined,
      );

      return { success: true, output: undefined };
    } catch (error: unknown) {
      if (context.signal?.aborted === true) throw error;
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `DynamoDB update failed: ${message}` };
    }
  }
}
