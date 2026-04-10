import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { Condition } from '../../types/Condition.js';
import { ConditionEvaluator } from '../../core/ConditionEvaluator.js';

/**
 * Configuration for an assert step.
 */
interface AssertStepConfig {
  readonly id: string;
  readonly label: string;
  readonly condition: Condition;
}

/**
 * Step that asserts a condition against the runbook context.
 * Returns success=true when the condition is satisfied, success=false with an error otherwise.
 *
 * @example
 * ```typescript
 * const step = assert({
 *   id: 'check-status',
 *   label: 'Verify status code is 200',
 *   condition: { type: 'compare', ref: 'vars.statusCode', operator: '==', value: '200' },
 * });
 * ```
 */
class AssertStep implements Step<boolean> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'check';

  private readonly condition: Condition;

  constructor(config: AssertStepConfig) {
    this.id = config.id;
    this.label = config.label;
    this.condition = config.condition;
  }

  /**
   * Evaluates the configured condition against the current runbook context.
   *
   * @param context - The current runbook execution context
   * @returns A result with output=true if the condition is satisfied, or success=false with an error message
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<boolean>> {
    const evaluator = new ConditionEvaluator();
    const passed = evaluator.evaluate(this.condition, context);

    if (passed) {
      return { success: true, output: true };
    }

    return {
      success: false,
      output: false,
      error: `Assertion failed for step "${this.id}": condition not satisfied`,
    };
  }
}

/**
 * Factory function that creates an AssertStep.
 *
 * @param config - Configuration containing id, label, and the condition to assert
 * @returns A Step that evaluates the condition and returns a boolean result
 */
export function assert(config: AssertStepConfig): Step<boolean> {
  return new AssertStep(config);
}
