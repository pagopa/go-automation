import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import { resolveRef } from './resolveRef.js';
import { Core } from '@go-automation/go-common';

const { valueToString } = Core;

/**
 * Supported comparison operators for the compare step.
 */
type CompareOperator = '==' | '!=' | '>' | '<' | '>=' | '<=';

/**
 * Configuration for a compare step.
 */
interface CompareStepConfig {
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
 * const step = compare({
 *   id: 'check-count',
 *   label: 'Verify item count exceeds threshold',
 *   leftRef: 'steps.fetch.output.count',
 *   operator: '>',
 *   rightValue: 10,
 * });
 * ```
 */
class CompareStep implements Step<boolean> {
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

    const leftStr = valueToString(leftValue);
    const rightStr = valueToString(this.rightValue);

    const leftNum = Number(leftStr);
    const rightNum = Number(rightStr);
    const bothNumeric = !Number.isNaN(leftNum) && !Number.isNaN(rightNum);

    const passed = evaluateOperator(this.operator, leftStr, rightStr, leftNum, rightNum, bothNumeric);

    if (passed) {
      return { success: true, output: true };
    }

    return {
      success: false,
      output: false,
      error: `Compare failed for step "${this.id}": "${leftStr}" ${this.operator} "${rightStr}" is false`,
    };
  }
}

/**
 * Evaluates a comparison operator between two values.
 * Uses numeric comparison when both values are valid numbers, string comparison otherwise.
 */
function evaluateOperator(
  operator: CompareOperator,
  leftStr: string,
  rightStr: string,
  leftNum: number,
  rightNum: number,
  bothNumeric: boolean,
): boolean {
  switch (operator) {
    case '==':
      return leftStr === rightStr;
    case '!=':
      return leftStr !== rightStr;
    case '>':
      return bothNumeric ? leftNum > rightNum : leftStr > rightStr;
    case '<':
      return bothNumeric ? leftNum < rightNum : leftStr < rightStr;
    case '>=':
      return bothNumeric ? leftNum >= rightNum : leftStr >= rightStr;
    case '<=':
      return bothNumeric ? leftNum <= rightNum : leftStr <= rightStr;
    default: {
      const _exhaustive: never = operator;
      throw new Error(`Unknown operator: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Factory function that creates a CompareStep.
 *
 * @param config - Configuration containing id, label, leftRef, operator, and rightValue
 * @returns A Step that compares a context value against a fixed value
 */
export function compare(config: CompareStepConfig): Step<boolean> {
  return new CompareStep(config);
}
