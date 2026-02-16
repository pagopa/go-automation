import type { SwitchBranchConfig } from '../../types/SwitchBranchConfig.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import { executeSubPipeline } from './executeSubPipeline.js';

/**
 * Control step that resolves a reference, matches it against cases, and executes
 * the corresponding inline sub-pipeline.
 *
 * Each case maps a string value to a sequence of steps that run sequentially
 * in a child context. If no case matches, the `defaultSteps` pipeline runs (if provided).
 * Variables produced by sub-steps are collected and returned in the StepResult.
 *
 * @example
 * ```typescript
 * const step = new SwitchBranchStep({
 *   id: 'switch-error-type',
 *   label: 'Handle error by type',
 *   ref: 'vars.errorType',
 *   cases: new Map([
 *     ['timeout', [setVar({ id: 'set-retry', label: 'Set retry', varName: 'action', value: 'retry' })]],
 *     ['not-found', [setVar({ id: 'set-skip', label: 'Set skip', varName: 'action', value: 'skip' })]],
 *   ]),
 *   defaultSteps: [setVar({ id: 'set-escalate', label: 'Escalate', varName: 'action', value: 'escalate' })],
 * });
 * ```
 */
export class SwitchBranchStep implements Step<void> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'control';

  private readonly config: SwitchBranchConfig;

  constructor(config: SwitchBranchConfig) {
    this.id = config.id;
    this.label = config.label;
    this.config = config;
  }

  /**
   * Resolves the reference, finds the matching case, and executes the sub-pipeline.
   * Variables produced by sub-steps are merged and returned in the result.
   *
   * @param context - The runbook execution context
   * @returns Step result with merged variables from the executed sub-pipeline
   */
  async execute(context: RunbookContext): Promise<StepResult<void>> {
    const resolved = this.resolveRef(this.config.ref, context);
    const resolvedStr = resolved !== undefined ? String(resolved) : undefined;

    const steps = this.findMatchingSteps(resolvedStr);

    if (steps.length === 0) {
      return { success: true };
    }

    return executeSubPipeline(steps, context);
  }

  /**
   * Resolves a reference string from the runbook context.
   * Supports 'vars.{name}' and 'params.{name}' formats.
   */
  private resolveRef(ref: string, context: RunbookContext): string | undefined {
    const dotIndex = ref.indexOf('.');
    if (dotIndex === -1) {
      return undefined;
    }

    const source = ref.slice(0, dotIndex);
    const key = ref.slice(dotIndex + 1);

    if (source === 'vars') {
      return context.vars.get(key);
    }

    if (source === 'params') {
      return context.params.get(key);
    }

    return undefined;
  }

  /**
   * Finds the steps to execute based on the resolved value.
   * Falls back to defaultSteps if no case matches.
   */
  private findMatchingSteps(value: string | undefined): ReadonlyArray<Step> {
    if (value !== undefined) {
      const caseSteps = this.config.cases.get(value);
      if (caseSteps !== undefined) {
        return caseSteps;
      }
    }

    return this.config.defaultSteps ?? [];
  }
}
