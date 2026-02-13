import type { RunbookContext } from '../../types/RunbookContext.js';
import type { Step } from '../../types/Step.js';
import type { StepResult } from '../../types/StepResult.js';

/**
 * Builds a StepResult with optional vars, avoiding explicit undefined assignment
 * which violates exactOptionalPropertyTypes.
 */
function buildResult(
  success: boolean,
  accumulatedVars: Readonly<Record<string, string>>,
  extra?: { readonly error?: string; readonly next?: 'stop' },
): StepResult<void> {
  const hasVars = Object.keys(accumulatedVars).length > 0;
  const base: StepResult<void> = hasVars ? { success, vars: accumulatedVars, ...extra } : { success, ...extra };
  return base;
}

/**
 * Executes a sequence of steps as an inline sub-pipeline within a child context.
 *
 * Creates a shallow copy of the parent context, then runs each step sequentially,
 * accumulating step results and variables. Variables produced by each sub-step
 * are merged into the child context so subsequent sub-steps can reference them.
 *
 * The final StepResult contains all accumulated variables from the sub-pipeline.
 * If any sub-step fails, execution stops and the error is propagated.
 *
 * @param steps - The ordered sequence of steps to execute
 * @param parentContext - The parent runbook context to copy from
 * @returns A StepResult containing merged variables from all sub-steps
 */
export async function executeSubPipeline(
  steps: ReadonlyArray<Step>,
  parentContext: RunbookContext,
): Promise<StepResult<void>> {
  const childStepResults = new Map<string, unknown>(parentContext.stepResults);
  const childVars = new Map<string, string>(parentContext.vars);
  const accumulatedVars: Record<string, string> = {};

  for (const step of steps) {
    const childContext: RunbookContext = {
      ...parentContext,
      stepResults: childStepResults,
      vars: childVars,
    };

    const result = await step.execute(childContext);

    if (!result.success) {
      return buildResult(false, accumulatedVars, {
        error: `Sub-step '${step.id}' failed: ${result.error ?? 'unknown error'}`,
      });
    }

    // Store step output in child context for subsequent sub-steps
    childStepResults.set(step.id, result.output);

    // Merge variables into child context and accumulator
    if (result.vars !== undefined) {
      for (const [key, value] of Object.entries(result.vars)) {
        childVars.set(key, value);
        accumulatedVars[key] = value;
      }
    }

    // If the sub-step requests a stop, propagate it
    if (result.next === 'stop') {
      return buildResult(true, accumulatedVars, { next: 'stop' });
    }
  }

  return buildResult(true, accumulatedVars);
}
