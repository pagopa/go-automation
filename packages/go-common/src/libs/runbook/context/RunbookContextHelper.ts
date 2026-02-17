import { randomUUID } from 'node:crypto';
import type { RunbookContext } from '../types/RunbookContext.js';
import type { StepResult } from '../types/StepResult.js';
import type { LogEntry } from '../types/LogEntry.js';
import type { ErrorRecoveryInfo } from '../types/ErrorRecoveryInfo.js';
import type { ServiceRegistry } from '../services/ServiceRegistry.js';

/**
 * Helper functions for immutable RunbookContext operations.
 * All functions return new context instances without mutating the original.
 */

/**
 * Creates an initial RunbookContext with the given parameters and services.
 *
 * @param params - Input parameters for the runbook
 * @param services - Service registry
 * @param signal - Optional abort signal to cancel the runbook execution
 * @returns A new initial context
 */
export function createInitialContext(
  params: ReadonlyMap<string, string>,
  services: ServiceRegistry,
  signal?: AbortSignal,
): RunbookContext {
  return {
    executionId: randomUUID(),
    startedAt: new Date(),
    stepResults: new Map(),
    vars: new Map(),
    params,
    logs: [],
    services,
    recoveredErrors: [],
    ...(signal ? { signal } : {}),
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
 * Adds a log entry to the context.
 *
 * @param context - Current context
 * @param entry - Log entry to add
 * @returns A new context with the log entry appended
 */
export function addLogEntry(context: RunbookContext, entry: LogEntry): RunbookContext {
  return {
    ...context,
    logs: [...context.logs, entry],
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

/**
 * Merges a child context (from sub-pipeline) back into the parent context.
 * Carries over stepResults, vars, logs, and recoveredErrors.
 *
 * @param parent - Parent context
 * @param child - Child context from sub-pipeline
 * @returns A new merged context
 */
export function mergeChildContext(parent: RunbookContext, child: RunbookContext): RunbookContext {
  const mergedStepResults = new Map(parent.stepResults);
  for (const [key, value] of child.stepResults) {
    mergedStepResults.set(key, value);
  }

  const mergedVars = new Map(parent.vars);
  for (const [key, value] of child.vars) {
    mergedVars.set(key, value);
  }

  return {
    ...parent,
    stepResults: mergedStepResults,
    vars: mergedVars,
    logs: [...parent.logs, ...child.logs],
    recoveredErrors: [...parent.recoveredErrors, ...child.recoveredErrors],
  };
}
