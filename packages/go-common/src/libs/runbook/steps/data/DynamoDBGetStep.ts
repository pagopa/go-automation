import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import { interpolateTemplate } from './interpolateTemplate.js';

/**
 * Configuration for the DynamoDB GetItem data step.
 */
export interface DynamoDBGetConfig {
  /** Unique step identifier */
  readonly id: string;
  /** Human-readable label for logs and UI */
  readonly label: string;
  /** DynamoDB table name (supports {{params.xxx}} and {{vars.xxx}} templates) */
  readonly tableName: string;
  /** Item key as a plain object (string values support template interpolation) */
  readonly key: Readonly<Record<string, unknown>>;
}

/**
 * Data step that retrieves a single item from a DynamoDB table by its primary key.
 * Supports template interpolation in the table name and string key values.
 *
 * @example
 * ```typescript
 * const step = getDynamoDBItem({
 *   id: 'fetch-notification',
 *   label: 'Fetch notification by IUN',
 *   tableName: 'pn-Notifications',
 *   key: { iun: '{{params.iun}}' },
 * });
 * ```
 */
export class DynamoDBGetStep implements Step<Record<string, unknown> | undefined> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly tableName: string;
  private readonly key: Readonly<Record<string, unknown>>;

  constructor(config: DynamoDBGetConfig) {
    this.id = config.id;
    this.label = config.label;
    this.tableName = config.tableName;
    this.key = config.key;
  }

  /**
   * Returns resolved DynamoDB GetItem configuration for the execution trace.
   *
   * @param context - The runbook execution context
   * @returns Trace info with resolved table name and key
   */
  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    return {
      tableName: interpolateTemplate(this.tableName, context),
      key: resolveKey(this.key, context),
    };
  }

  /**
   * Retrieves a single item from DynamoDB using the configured key.
   *
   * @param context - The runbook execution context
   * @returns Step result containing the unmarshalled item, or undefined if not found
   */
  async execute(context: RunbookContext): Promise<StepResult<Record<string, unknown> | undefined>> {
    try {
      const resolvedTableName = interpolateTemplate(this.tableName, context);
      const resolvedKey = resolveKey(this.key, context);

      const result = await context.services.dynamodb.getItem(resolvedTableName, resolvedKey);

      return { success: true, output: result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `DynamoDB GetItem failed: ${message}` };
    }
  }
}

/**
 * Resolves template placeholders in string values of a DynamoDB key object.
 * Non-string values are passed through unchanged.
 */
function resolveKey(key: Readonly<Record<string, unknown>>, context: RunbookContext): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(key)) {
    if (typeof v === 'string') {
      resolved[k] = interpolateTemplate(v, context);
    } else {
      resolved[k] = v;
    }
  }
  return resolved;
}

/**
 * Factory function for creating a DynamoDB GetItem data step.
 *
 * @param config - Step configuration
 * @returns A new DynamoDBGetStep instance
 */
export function getDynamoDBItem(config: DynamoDBGetConfig): DynamoDBGetStep {
  return new DynamoDBGetStep(config);
}
