import type { IfBranchConfig } from '../../types/IfBranchConfig.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import { ConditionEvaluator } from '../../core/ConditionEvaluator.js';
import { executeSubPipeline } from './executeSubPipeline.js';

/**
 * Control step that evaluates a condition and executes an inline sub-pipeline.
 * When the condition is true, the `thenSteps` pipeline is executed.
 * When the condition is false, the `elseSteps` pipeline is executed (if provided).
 *
 * Sub-pipeline steps run sequentially in a child context (copy of parent).
 * Variables produced by sub-steps are collected and returned in the StepResult.
 *
 * @example
 * ```typescript
 * const step = new IfBranchStep({
 *   id: 'branch-on-error',
 *   label: 'Branch on error type',
 *   condition: { type: 'compare', ref: 'vars.errorType', operator: '==', value: 'timeout' },
 *   thenSteps: [setVar({ id: 'set-retry', label: 'Set retry flag', varName: 'shouldRetry', value: 'true' })],
 *   elseSteps: [setVar({ id: 'set-skip', label: 'Set skip flag', varName: 'shouldRetry', value: 'false' })],
 * });
 * ```
 */
export class IfBranchStep implements Step<void> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'control';

  private readonly config: IfBranchConfig;
  private readonly evaluator: ConditionEvaluator;

  constructor(config: IfBranchConfig) {
    this.id = config.id;
    this.label = config.label;
    this.config = config;
    this.evaluator = new ConditionEvaluator();
  }

  /**
   * Evaluates the condition and executes the appropriate sub-pipeline inline.
   * Variables produced by sub-steps are merged and returned in the result.
   *
   * @param context - The runbook execution context
   * @returns Step result with merged variables from the executed sub-pipeline
   */
  async execute(context: RunbookContext): Promise<StepResult<void>> {
    const conditionResult = this.evaluator.evaluate(this.config.condition, context);

    const steps: ReadonlyArray<Step> = conditionResult ? this.config.thenSteps : (this.config.elseSteps ?? []);

    if (steps.length === 0) {
      return { success: true };
    }

    return executeSubPipeline(steps, context);
  }
}
