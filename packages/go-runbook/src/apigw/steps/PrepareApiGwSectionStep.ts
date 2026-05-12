import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';
import { ApiGwReporter } from '../reporting/ApiGwReporter.js';

/**
 * Configuration for {@link prepareApiGwSection}.
 */
export interface PrepareApiGwSectionConfig {
  /** Unique step identifier */
  readonly id: string;
  /** Human-readable label */
  readonly label: string;
  /** API Gateway log group displayed in the section header */
  readonly apiGwLogGroup: string;
}

class PrepareApiGwSectionStepImpl implements Step<undefined> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'control';

  private readonly apiGwLogGroup: string;

  constructor(config: PrepareApiGwSectionConfig) {
    this.id = config.id;
    this.label = config.label;
    this.apiGwLogGroup = config.apiGwLogGroup;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<undefined>> {
    if (context.logger !== undefined) {
      new ApiGwReporter(context.logger).sectionPrepare(this.apiGwLogGroup);
    }
    return { success: true };
  }
}

/**
 * Factory: zero-op step that prints the "Preparazione: query API Gateway"
 * section header via the {@link ApiGwReporter}.
 *
 * The step is intentionally trivial: it exists only so the reporter
 * banner appears in the structured log stream at exactly the right
 * point in the pipeline (before the API Gateway query runs).
 *
 * @param config - Step configuration
 * @returns Step that emits the section header
 */
export function prepareApiGwSection(config: PrepareApiGwSectionConfig): Step<undefined> {
  return new PrepareApiGwSectionStepImpl(config);
}
