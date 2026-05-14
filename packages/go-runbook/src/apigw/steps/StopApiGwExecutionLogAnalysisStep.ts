import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';

export interface StopApiGwExecutionLogAnalysisConfig {
  /** Unique step identifier. */
  readonly id: string;
  /** Human-readable label. */
  readonly label: string;
}

class StopApiGwExecutionLogAnalysisStepImpl implements Step<void> {
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
        lastErrorMsg:
          context.vars.get('lastErrorMsg') ??
          "API Gateway execution log analizzati, ma non e' stato possibile determinare il problema.",
      },
      next: 'stop',
    };
  }
}

/**
 * Factory: creates the guard step that stops the runbook when the
 * requestId-based execution-log branch did not match any known case.
 */
export function stopApiGwExecutionLogAnalysis(config: StopApiGwExecutionLogAnalysisConfig): Step<void> {
  return new StopApiGwExecutionLogAnalysisStepImpl(config);
}
