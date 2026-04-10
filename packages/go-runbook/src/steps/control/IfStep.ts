import type { Condition } from '../../types/Condition.js';
import type { FlowDirective } from '../../types/FlowDirective.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import { ConditionEvaluator } from '../../core/ConditionEvaluator.js';

/**
 * Configuration for the conditional control flow step.
 */
export interface IfStepConfig {
  /** Unique step identifier */
  readonly id: string;
  /** Human-readable label for logs and UI */
  readonly label: string;
  /** Condition to evaluate against the runbook context */
  readonly condition: Condition;
  /** Step ID to jump to when the condition is true */
  readonly thenGoTo?: string;
  /** Step ID to jump to when the condition is false */
  readonly elseGoTo?: string;
}

/**
 * Control step that evaluates a condition and directs execution flow accordingly.
 * When the condition is true, execution jumps to `thenGoTo` (or continues if not set).
 * When the condition is false, execution jumps to `elseGoTo` (or continues if not set).
 *
 * The `thenGoTo` and `elseGoTo` properties are exposed as public readonly for graph analysis.
 *
 * @example
 * ```typescript
 * const step = ifCondition({
 *   id: 'check-status',
 *   label: 'Check HTTP status code',
 *   condition: { type: 'compare', ref: 'vars.statusCode', operator: '==', value: '504' },
 *   thenGoTo: 'handle-timeout',
 *   elseGoTo: 'handle-other-error',
 * });
 * ```
 */
export class IfStep implements Step<void> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'control';

  /** Step ID to jump to when the condition is true (exposed for graph analysis) */
  readonly thenGoTo: string | undefined;
  /** Step ID to jump to when the condition is false (exposed for graph analysis) */
  readonly elseGoTo: string | undefined;

  private readonly condition: Condition;
  private readonly evaluator: ConditionEvaluator;

  constructor(config: IfStepConfig) {
    this.id = config.id;
    this.label = config.label;
    this.condition = config.condition;
    this.thenGoTo = config.thenGoTo;
    this.elseGoTo = config.elseGoTo;
    this.evaluator = new ConditionEvaluator();
  }

  /**
   * Evaluates the condition and returns a flow directive based on the result.
   *
   * @param context - The runbook execution context
   * @returns Step result with a flow directive (goTo or continue)
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<void>> {
    const result = this.evaluator.evaluate(this.condition, context);
    const next = this.resolveDirective(result);
    return { success: true, next };
  }

  /**
   * Resolves the flow directive based on the condition evaluation result.
   */
  private resolveDirective(conditionResult: boolean): FlowDirective {
    if (conditionResult) {
      return this.thenGoTo !== undefined ? { goTo: this.thenGoTo } : 'continue';
    }
    return this.elseGoTo !== undefined ? { goTo: this.elseGoTo } : 'continue';
  }
}

/**
 * Factory function for creating a conditional control flow step.
 *
 * @param config - Step configuration
 * @returns A new IfStep instance
 */
export function ifCondition(config: IfStepConfig): IfStep {
  return new IfStep(config);
}
