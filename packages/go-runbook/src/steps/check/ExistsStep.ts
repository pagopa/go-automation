import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import { resolveRef } from './resolveRef.js';
import { Core } from '@go-automation/go-common';

const { valueToString } = Core;

/**
 * Configuration for an exists step.
 */
interface ExistsStepConfig {
  readonly id: string;
  readonly label: string;
  /** Reference to a value in context (e.g. 'vars.x', 'params.x', 'steps.step1.output[0]') */
  readonly ref: string;
}

/**
 * Step that checks whether a context reference resolves to a meaningful value.
 * A value is considered to exist if it is not undefined, not null, and not an empty string.
 *
 * @example
 * ```typescript
 * const step = exists({
 *   id: 'check-trace-id',
 *   label: 'Verify traceId was extracted',
 *   ref: 'vars.traceId',
 * });
 * ```
 */
class ExistsStep implements Step<boolean> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'check';

  private readonly ref: string;

  constructor(config: ExistsStepConfig) {
    this.id = config.id;
    this.label = config.label;
    this.ref = config.ref;
  }

  /**
   * Resolves the reference from context and checks whether the value exists.
   *
   * @param context - The current runbook execution context
   * @returns A result with output=true if the value exists, or success=false with an error message
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<boolean>> {
    const value = resolveRef(this.ref, context);
    const valueStr = valueToString(value);
    const valueExists = value !== undefined && value !== null && valueStr !== '';

    if (valueExists) {
      return { success: true, output: true };
    }

    return {
      success: false,
      output: false,
      error: `Exists check failed for step "${this.id}": reference "${this.ref}" is ${value === undefined ? 'undefined' : value === null ? 'null' : 'empty'}`,
    };
  }
}

/**
 * Factory function that creates an ExistsStep.
 *
 * @param config - Configuration containing id, label, and the ref to check for existence
 * @returns A Step that checks whether a context value exists
 */
export function exists(config: ExistsStepConfig): Step<boolean> {
  return new ExistsStep(config);
}
