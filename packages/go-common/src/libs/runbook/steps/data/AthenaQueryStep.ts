import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import { interpolateTemplate } from './interpolateTemplate.js';

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
 * Template variables in the query string are interpolated from context params and vars.
 *
 * @example
 * ```typescript
 * const step = queryAthena({
 *   id: 'fetch-delivery-data',
 *   label: 'Fetch delivery data from Athena',
 *   database: 'send_analytics',
 *   query: "SELECT * FROM deliveries WHERE iun = '{{params.iun}}' LIMIT 100",
 * });
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
   * Executes the Athena SQL query with interpolated template variables.
   *
   * @param context - The runbook execution context
   * @returns Step result containing an array of key-value result rows
   */
  async execute(context: RunbookContext): Promise<StepResult<ReadonlyArray<Record<string, string>>>> {
    try {
      const interpolatedQuery = interpolateTemplate(this.query, context);

      const results = await context.services.athena.query(this.database, interpolatedQuery);

      return { success: true, output: results };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Athena query failed: ${message}` };
    }
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
