import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import { resolveRef } from './resolveRef.js';
import { compileRegex } from '../../core/compileRegex.js';
import { valueToString } from '@go-automation/go-common/core';

/**
 * Configuration for a pattern match step.
 */
interface PatternMatchStepConfig {
  readonly id: string;
  readonly label: string;
  /** Reference to a value in context (e.g. 'vars.x', 'params.x', 'steps.x.output') */
  readonly ref: string;
  /** Regular expression pattern to test against the resolved value */
  readonly regex: string;
}

/**
 * Step that resolves a context reference and tests it against a regular expression.
 * Returns success=true when the pattern matches, success=false otherwise.
 *
 * @example
 * ```typescript
 * const step = patternMatch({
 *   id: 'check-error-format',
 *   label: 'Verify error message matches expected pattern',
 *   ref: 'vars.errorMessage',
 *   regex: '^TIMEOUT:.+',
 * });
 * ```
 */
class PatternMatchStep implements Step<boolean> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'check';

  private readonly ref: string;
  private readonly regex: string;

  constructor(config: PatternMatchStepConfig) {
    this.id = config.id;
    this.label = config.label;
    this.ref = config.ref;
    this.regex = config.regex;
  }

  /**
   * Resolves the reference from context and tests it against the configured regex pattern.
   *
   * @param context - The current runbook execution context
   * @returns A result with output=true if the pattern matches, or success=false with an error message
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<boolean>> {
    const value = resolveRef(this.ref, context);

    if (value === undefined || value === null) {
      return {
        success: false,
        output: false,
        error: `Pattern match failed for step "${this.id}": reference "${this.ref}" resolved to ${String(value)}`,
      };
    }

    const valueStr = valueToString(value);
    const compiled = compileRegex(this.regex);
    const passed = compiled.test(valueStr);

    if (passed) {
      return { success: true, output: true };
    }

    return {
      success: false,
      output: false,
      error: `Pattern match failed for step "${this.id}": "${valueStr}" does not match /${this.regex}/`,
    };
  }
}

/**
 * Factory function that creates a PatternMatchStep.
 *
 * @param config - Configuration containing id, label, ref, and regex pattern
 * @returns A Step that tests a context value against a regular expression
 */
export function patternMatch(config: PatternMatchStepConfig): Step<boolean> {
  return new PatternMatchStep(config);
}
