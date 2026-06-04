import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';
import { LambdaReporter } from '../reporting/LambdaReporter.js';

/**
 * Configuration for {@link prepareLambdaSection}.
 */
export interface PrepareLambdaSectionConfig {
  readonly id: string;
  readonly label: string;
  readonly lambdaName: string;
  readonly logGroup: string;
  readonly eventSource?: string;
  readonly configuredTimeoutMs?: number;
}

class PrepareLambdaSectionStepImpl implements Step<undefined> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'control';

  private readonly lambdaName: string;
  private readonly logGroup: string;
  private readonly eventSource: string;
  private readonly configuredTimeoutMs: number | undefined;

  constructor(config: PrepareLambdaSectionConfig) {
    this.id = config.id;
    this.label = config.label;
    this.lambdaName = config.lambdaName;
    this.logGroup = config.logGroup;
    this.eventSource = config.eventSource ?? '';
    this.configuredTimeoutMs = config.configuredTimeoutMs;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<undefined>> {
    if (context.logger !== undefined) {
      new LambdaReporter(context.logger).sectionPrepare(this.lambdaName, this.logGroup, this.eventSource);
    }
    return {
      success: true,
      vars: {
        lambdaFunctionName: this.lambdaName,
        lambdaLogGroup: this.logGroup,
        lambdaEventSource: this.eventSource,
        ...(this.configuredTimeoutMs !== undefined
          ? { lambdaConfiguredTimeoutMs: String(this.configuredTimeoutMs) }
          : {}),
      },
    };
  }
}

/**
 * Factory: prints the Lambda preparation banner and seeds the canonical
 * `lambdaFunctionName` / `lambdaLogGroup` / `lambdaEventSource` vars (and
 * `lambdaConfiguredTimeoutMs` when configured) so they are available even
 * when the error scan returns no rows.
 *
 * @param config - Step configuration
 * @returns Step that emits the section header
 */
export function prepareLambdaSection(config: PrepareLambdaSectionConfig): Step<undefined> {
  return new PrepareLambdaSectionStepImpl(config);
}
