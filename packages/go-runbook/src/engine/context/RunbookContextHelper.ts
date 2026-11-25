import { randomUUID } from 'node:crypto';
import type { RunbookContext } from '../types/RunbookContext.js';
import type { StepResult } from '../types/StepResult.js';
import type { ErrorRecoveryInfo } from '../types/ErrorRecoveryInfo.js';
import type { GORegexCache } from '@pagopa/go-common/utils';
import type { WorkflowServices } from '../types/WorkflowServices.js';
import { EMPTY_RUNBOOK_READS } from '../reads/EMPTY_RUNBOOK_READS.js';

/**
 * Helper functions for immutable RunbookContext operations.
 * All functions return new context instances without mutating the original.
 */

/**
 * Creates an initial RunbookContext with the given parameters and services.
 *
 * @param params - Input parameters for the runbook
 * @param services - Services of the execution
 * @param signal - Optional abort signal to cancel the runbook execution
 * @param regexCache - Compiled-regex cache of the engine running the context
 * @returns A new initial context
 */
export function createInitialContext<TServices extends WorkflowServices>(
  params: ReadonlyMap<string, string>,
  services: TServices,
  signal?: AbortSignal,
  regexCache?: GORegexCache,
): RunbookContext<TServices> {
  return {
    executionId: randomUUID(),
    startedAt: new Date(),
    stepResults: new Map(),
    vars: new Map(),
    params,
    services,
    recoveredErrors: [],
    reads: EMPTY_RUNBOOK_READS,
    ...(signal ? { signal } : {}),
    ...(regexCache ? { regexCache } : {}),
  };
}

/**
 * Updates a context with the result of a step execution.
 * Merges step output into stepResults and vars into context vars.
 *
 * @param context - Current context
 * @param stepId - ID of the step that produced the result
 * @param result - Step execution result
 * @returns A new updated context
 */
export function updateContextWithStepResult(
  context: RunbookContext,
  stepId: string,
  result: StepResult,
): RunbookContext {
  const newStepResults = new Map(context.stepResults);
  if (result.output !== undefined) {
    newStepResults.set(stepId, result.output);
  }

  let newVars = context.vars;
  if (result.vars !== undefined) {
    const varsMap = new Map(context.vars);
    for (const [key, value] of Object.entries(result.vars)) {
      varsMap.set(key, value);
    }
    newVars = varsMap;
  }

  return {
    ...context,
    stepResults: newStepResults,
    vars: newVars,
  };
}

/**
 * Adds a recovered error to the context.
 *
 * @param context - Current context
 * @param recovery - Error recovery info to add
 * @returns A new context with the recovery info appended
 */
export function addRecoveredError(context: RunbookContext, recovery: ErrorRecoveryInfo): RunbookContext {
  return {
    ...context,
    recoveredErrors: [...context.recoveredErrors, recovery],
  };
}
