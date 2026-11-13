import type { RunbookDynamoDBAttributeValue } from '../../../services/ports/RunbookDynamoDBAttributeValue.js';
import type { Step } from '../../../../../engine/types/Step.js';
import type { StepKind } from '../../../../../engine/types/StepKind.js';
import type { StepResult } from '../../../../../engine/types/StepResult.js';
import type { RunbookContext } from '../../../../../engine/types/RunbookContext.js';
import { interpolatePlaceholders } from '../../../../../engine/context/templatePlaceholders.js';
import { executeStep } from '../../../../../engine/steps/execution/executeStep.js';
import { OperationalStep } from '../../OperationalStep.js';
import type { OperationalContext } from '../../../services/OperationalContext.js';
import type { OperationalServiceName } from '../../../services/OperationalServiceName.js';

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
  /**
   * Key condition expression using DynamoDB placeholders (`:val`, `#name`).
   * Do NOT use `{{params.xxx}}` templates here — use `expressionAttributeValues`
   * for values and `expressionAttributeNames` for dynamic field names.
   */
  readonly keyConditionExpression: string;
  /** Expression attribute values for the key condition (string S values support {{params.xxx}} templates) */
  readonly expressionAttributeValues: Readonly<Record<string, RunbookDynamoDBAttributeValue>>;
  /** Optional expression attribute names for reserved words or dynamic field references (values support {{params.xxx}} templates) */
  readonly expressionAttributeNames?: Readonly<Record<string, string>>;
}

/**
 * Data step that queries a DynamoDB table using a key condition expression.
 * Supports template interpolation in the table name and key condition expression.
 *
 * @example
 * ```typescript
 * const step = new DynamoDBQueryStep({
 *   id: 'fetch-notifications',
 *   label: 'Fetch notifications by IUN',
 *   tableName: 'pn-Notifications',
 *   keyConditionExpression: 'iun = :iun',
 *   expressionAttributeValues: { ':iun': { S: '{{params.iun}}' } },
 * });
 * ```
 */
export class DynamoDBQueryStep
  extends OperationalStep<ReadonlyArray<Record<string, unknown>>>
  implements Step<ReadonlyArray<Record<string, unknown>>>
{
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly tableName: string;
  private readonly keyConditionExpression: string;
  private readonly expressionAttributeValues: Readonly<Record<string, RunbookDynamoDBAttributeValue>>;
  private readonly expressionAttributeNames: Readonly<Record<string, string>> | undefined;

  constructor(config: DynamoDBQueryConfig) {
    super();
    this.id = config.id;
    this.label = config.label;
    this.tableName = config.tableName;
    this.keyConditionExpression = config.keyConditionExpression;
    this.expressionAttributeValues = config.expressionAttributeValues;
    this.expressionAttributeNames = config.expressionAttributeNames;
  }

  /**
   * Returns resolved DynamoDB query configuration for the execution trace.
   *
   * @param context - The runbook execution context
   * @returns Trace info with resolved table name, expression, and attribute values
   */
  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    return {
      tableName: interpolatePlaceholders(this.tableName, context),
      keyConditionExpression: this.keyConditionExpression,
      expressionAttributeValues: resolveAttributeValues(this.expressionAttributeValues, context),
      ...(this.expressionAttributeNames !== undefined
        ? { expressionAttributeNames: resolveAttributeNames(this.expressionAttributeNames, context) }
        : {}),
    };
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
   * Executes a DynamoDB query with the configured key condition.
   *
   * @param context - The runbook execution context
   * @returns Step result containing an array of unmarshalled DynamoDB items
   */
  override async execute(context: OperationalContext): Promise<StepResult<ReadonlyArray<Record<string, unknown>>>> {
    return executeStep('DynamoDB query', async () => {
      const resolvedTableName = interpolatePlaceholders(this.tableName, context);
      const resolvedValues = resolveAttributeValues(this.expressionAttributeValues, context);
      const resolvedNames =
        this.expressionAttributeNames !== undefined
          ? resolveAttributeNames(this.expressionAttributeNames, context)
          : undefined;

      const results = await context.services.dynamodb.query(
        resolvedTableName,
        this.keyConditionExpression,
        resolvedValues,
        resolvedNames,
        undefined,
        context.signal,
      );

      return { success: true, output: results };
    });
  }
}

/**
 * Resolves template placeholders inside string-typed DynamoDB attribute values (S type).
 * Non-string attribute values are passed through unchanged.
 */
function resolveAttributeValues(
  values: Readonly<Record<string, RunbookDynamoDBAttributeValue>>,
  context: RunbookContext,
): Record<string, RunbookDynamoDBAttributeValue> {
  const resolved: Record<string, RunbookDynamoDBAttributeValue> = {};
  for (const [key, attr] of Object.entries(values)) {
    if ('S' in attr && typeof attr.S === 'string') {
      resolved[key] = { ...attr, S: interpolatePlaceholders(attr.S, context) };
    } else {
      resolved[key] = attr;
    }
  }
  return resolved;
}

/**
 * Resolves template placeholders in expression attribute name values.
 * Used for dynamic field references via `#name` aliases in DynamoDB expressions.
 */
function resolveAttributeNames(
  names: Readonly<Record<string, string>>,
  context: RunbookContext,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(names)) {
    resolved[key] = interpolatePlaceholders(value, context);
  }
  return resolved;
}
