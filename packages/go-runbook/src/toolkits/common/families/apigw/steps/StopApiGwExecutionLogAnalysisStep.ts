import type { RunbookContext, Step, StepKind, StepResult } from '../../../../../engine/index.js';

export interface StopApiGwExecutionLogAnalysisConfig {
  /** Unique step identifier. */
  readonly id: string;
  /** Human-readable label. */
  readonly label: string;
}

/**
 * Stops the analysis when the execution log was read without explaining the error.
 */
export class StopApiGwExecutionLogAnalysisStep implements Step<void> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'control';

  constructor(config: StopApiGwExecutionLogAnalysisConfig) {
    this.id = config.id;
    this.label = config.label;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<void>> {
    const mode = (context.vars.get('apiGwExecutionLogMode') ?? '').trim();
    if (mode !== 'queried') {
      return { success: true };
    }

    return {
      success: true,
      vars: {
        terminationReason: 'api-gw-execution-log-unresolved',
        lastErrorMsg: "API Gateway execution log analizzati, ma non e' stato possibile determinare il problema.",
      },
      next: 'stop',
    };
  }
}
