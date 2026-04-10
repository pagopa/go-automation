import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import { interpolateTemplate, extractTemplateParameters } from './interpolateTemplate.js';
import { executeStep } from './executeStep.js';

/**
 * Configuration for the Athena query data step.
 */
export interface AthenaQueryConfig {
  /** Unique step identifier */
  readonly id: string;
  /** Human-readable label for logs and UI */
  readonly label: string;
  /** Athena database name */
  readonly database: string;
  /** SQL query string (supports {{params.xxx}} and {{vars.xxx}} templates) */
  readonly query: string;
}

/**
 * Data step that executes an Athena SQL query.
 *
 * Template placeholders (`{{params.xxx}}`, `{{vars.xxx}}`) are extracted and passed
 * to Athena as `ExecutionParameters` (positional `?` placeholders), preventing SQL injection.
 * The query structure is separated from user-supplied values at the SDK level.
 *
 * @example
 * ```typescript
 * const step = queryAthena({
 *   id: 'fetch-delivery-data',
 *   label: 'Fetch delivery data from Athena',
 *   database: 'send_analytics',
 *   query: "SELECT * FROM deliveries WHERE iun = '{{params.iun}}' LIMIT 100",
 * });
 * // Executed as: query = "SELECT * FROM deliveries WHERE iun = ? LIMIT 100"
 * //              parameters = ['ABCD-1234']
 * ```
 */
export class AthenaQueryStep implements Step<ReadonlyArray<Record<string, string>>> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly database: string;
  private readonly query: string;

  constructor(config: AthenaQueryConfig) {
    this.id = config.id;
    this.label = config.label;
    this.database = config.database;
    this.query = config.query;
  }

  /**
   * Returns resolved query and database for the execution trace.
   * Shows the interpolated query (with values inlined) for readability in traces.
   *
   * @param context - The runbook execution context
   * @returns Trace info with resolved query and database name
   */
  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    return {
      query: interpolateTemplate(this.query, context),
      database: this.database,
    };
  }

  /**
   * Executes the Athena SQL query using parameterized execution.
   * Template placeholders are extracted and passed as `ExecutionParameters`
   * to prevent SQL injection.
   *
   * @param context - The runbook execution context
   * @returns Step result containing an array of key-value result rows
   */
  async execute(context: RunbookContext): Promise<StepResult<ReadonlyArray<Record<string, string>>>> {
    return executeStep('Athena query', async () => {
      const { query, parameters } = extractTemplateParameters(this.query, context);
      const results = await context.services.athena.query(this.database, query, parameters, context.signal);
      return { success: true, output: results };
    });
  }
}

/**
 * Factory function for creating an Athena query data step.
 *
 * @param config - Step configuration
 * @returns A new AthenaQueryStep instance
 */
export function queryAthena(config: AthenaQueryConfig): AthenaQueryStep {
  return new AthenaQueryStep(config);
}
