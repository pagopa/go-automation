import type { Step } from '../../../../../engine/types/Step.js';
import type { StepKind } from '../../../../../engine/types/StepKind.js';
import type { StepResult } from '../../../../../engine/types/StepResult.js';
import { throwIfRunbookAborted } from '../../../../../engine/context/throwIfRunbookAborted.js';
import { OperationalStep } from '../../OperationalStep.js';
import type { OperationalContext } from '../../../services/OperationalContext.js';
import type { OperationalServiceName } from '../../../services/OperationalServiceName.js';

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
 * const step = new DynamoDBPutStep({
 *   id: 'insert-record',
 *   label: 'Insert audit record',
 *   tableName: 'pn-audit-log',
 *   item: { pk: 'AUDIT#001', action: 'resolve', timestamp: '2025-01-01T00:00:00Z' },
 * });
 * ```
 */
export class DynamoDBPutStep extends OperationalStep<void> implements Step<void> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'mutation';

  private readonly tableName: string;
  private readonly item: Readonly<Record<string, unknown>>;

  constructor(config: DynamoDBPutConfig) {
    super();
    this.id = config.id;
    this.label = config.label;
    this.tableName = config.tableName;
    this.item = config.item;
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
   * Executes the DynamoDB put operation.
   *
   * @param context - The runbook execution context
   * @returns Step result indicating success or failure
   */
  override async execute(context: OperationalContext): Promise<StepResult<void>> {
    try {
      throwIfRunbookAborted(context);
      await context.services.dynamodb.putItem(this.tableName, { ...this.item });

      return { success: true, output: undefined };
    } catch (error: unknown) {
      if (context.signal?.aborted === true) throw error;
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `DynamoDB put failed: ${message}` };
    }
  }
}
