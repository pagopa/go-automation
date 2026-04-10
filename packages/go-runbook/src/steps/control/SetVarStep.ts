import type { RunbookContext } from '../../types/RunbookContext.js';
import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import { interpolateTemplate } from '../data/interpolateTemplate.js';

/**
 * Configuration for the set-variable control step.
 */
export interface SetVarStepConfig {
  /** Unique step identifier */
  readonly id: string;
  /** Human-readable label for logs and UI */
  readonly label: string;
  /** Name of the variable to set in the context */
  readonly varName: string;
  /** Literal value to assign (mutually exclusive with expression) */
  readonly value?: string;
  /** Template expression to interpolate (supports {{vars.xxx}} and {{params.xxx}}) */
  readonly expression?: string;
}

/**
 * Control step that sets a variable in the runbook context.
 * Supports both literal values and template expressions with interpolation.
 *
 * Exactly one of `value` or `expression` must be provided. If `value` is set,
 * it is used directly. If `expression` is set, it is interpolated using the
 * current context's vars and params.
 *
 * @example
 * ```typescript
 * // Literal value
 * const step1 = setVar({ id: 'set-env', label: 'Set environment', varName: 'env', value: 'production' });
 *
 * // Template expression
 * const step2 = setVar({
 *   id: 'set-url',
 *   label: 'Build API URL',
 *   varName: 'apiUrl',
 *   expression: 'https://{{params.host}}/api/{{vars.version}}',
 * });
 * ```
 */
export class SetVarStep implements Step<void> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'control';

  private readonly varName: string;
  private readonly value: string | undefined;
  private readonly expression: string | undefined;

  constructor(config: SetVarStepConfig) {
    this.id = config.id;
    this.label = config.label;
    this.varName = config.varName;
    this.value = config.value;
    this.expression = config.expression;
  }

  /**
   * Resolves the variable value and returns it in the StepResult vars.
   *
   * @param context - The runbook execution context
   * @returns Step result with the variable set in vars
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<void>> {
    const resolved = this.resolveValue(context);
    return {
      success: true,
      vars: { [this.varName]: resolved },
    };
  }

  /**
   * Resolves the final value from either the literal value or the interpolated expression.
   */
  private resolveValue(context: RunbookContext): string {
    if (this.value !== undefined) {
      return this.value;
    }

    if (this.expression !== undefined) {
      return interpolateTemplate(this.expression, context);
    }

    return '';
  }
}

/**
 * Factory function for creating a set-variable control step.
 *
 * @param config - Step configuration
 * @returns A new SetVarStep instance
 */
export function setVar(config: SetVarStepConfig): SetVarStep {
  return new SetVarStep(config);
}
