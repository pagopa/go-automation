import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import { resolveRef } from './resolveRef.js';
import { valueToString } from '@go-automation/go-common/core';
import { compareValues } from '../../core/compareValues.js';
import type { CompareOperator } from '../../core/CompareOperator.js';

/**
 * Configuration for a compare step.
 */
export interface CompareStepConfig {
  readonly id: string;
  readonly label: string;
  /** Reference to a value in context (e.g. 'vars.x', 'params.x', 'steps.x.output') */
  readonly leftRef: string;
  readonly operator: CompareOperator;
  readonly rightValue: string | number | boolean;
}

/**
 * Step that resolves a context reference and compares it against a fixed value.
 * Performs numeric comparison when both sides are valid numbers, string comparison otherwise.
 *
 * @example
 * ```typescript
 * const step = new CompareStep({
 *   id: 'check-count',
 *   label: 'Verify item count exceeds threshold',
 *   leftRef: 'steps.fetch.output.count',
 *   operator: '>',
 *   rightValue: 10,
 * });
 * ```
 */
export class CompareStep implements Step<boolean> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'check';

  private readonly leftRef: string;
  private readonly operator: CompareOperator;
  private readonly rightValue: string | number | boolean;

  constructor(config: CompareStepConfig) {
    this.id = config.id;
    this.label = config.label;
    this.leftRef = config.leftRef;
    this.operator = config.operator;
    this.rightValue = config.rightValue;
  }

  /**
   * Resolves the left reference from context and compares it with the configured right value.
   *
   * @param context - The current runbook execution context
   * @returns A result with output=true if the comparison holds, or success=false with an error message
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<boolean>> {
    const leftValue = resolveRef(this.leftRef, context);

    if (leftValue === undefined || leftValue === null) {
      return {
        success: false,
        output: false,
        error: `Compare failed for step "${this.id}": reference "${this.leftRef}" resolved to ${String(leftValue)}`,
      };
    }

    if (compareValues(leftValue, this.operator, this.rightValue)) {
      return { success: true, output: true };
    }

    return {
      success: false,
      output: false,
      error:
        `Compare failed for step "${this.id}": ` +
        `"${valueToString(leftValue)}" ${this.operator} "${valueToString(this.rightValue)}" is false`,
    };
  }
}
