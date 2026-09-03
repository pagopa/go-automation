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

export class PrepareApiGwSectionStep implements Step<undefined> {
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
    new ApiGwReporter(context.services.reporter).sectionPrepare(this.apiGwLogGroup);
    return { success: true };
  }
}
