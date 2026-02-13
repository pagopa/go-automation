import type { RunbookContext } from '../../types/RunbookContext.js';

/**
 * Resolves a dot-separated reference string against the runbook context.
 *
 * Supported formats:
 * - `'vars.{name}'`                    - context variable
 * - `'params.{name}'`                  - input parameter
 * - `'steps.{stepId}.output'`          - step output
 * - `'steps.{stepId}.output.field'`    - nested step output field
 * - `'steps.{stepId}.output[0].field'` - array-indexed step output
 *
 * @param ref - The reference string to resolve
 * @param context - The current runbook execution context
 * @returns The resolved value, or undefined if the path cannot be resolved
 */
export function resolveRef(ref: string, context: RunbookContext): unknown {
  const parts = ref.split('.');
  const source = parts[0];

  if (source === 'vars') {
    const varName = parts.slice(1).join('.');
    return context.vars.get(varName);
  }

  if (source === 'params') {
    const paramName = parts.slice(1).join('.');
    return context.params.get(paramName);
  }

  if (source === 'steps') {
    const stepId = parts[1];
    if (stepId === undefined) {
      return undefined;
    }
    const stepOutput = context.stepResults.get(stepId);
    if (stepOutput === undefined) {
      return undefined;
    }

    const remainingPath = parts.slice(2).join('.');
    if (remainingPath === '' || remainingPath === 'output') {
      return stepOutput;
    }

    const fieldPath = remainingPath.startsWith('output.') ? remainingPath.slice('output.'.length) : remainingPath;

    return navigatePath(stepOutput, fieldPath);
  }

  return undefined;
}

/**
 * Navigates a nested object/array by a dot-separated path.
 * Supports array indexing with bracket notation (e.g. `[0].field`).
 *
 * @param obj - The root object to navigate
 * @param path - Dot-separated path with optional array indices
 * @returns The value at the path, or undefined if navigation fails
 */
function navigatePath(obj: unknown, path: string): unknown {
  if (path === '') {
    return obj;
  }

  const segments = path.match(/[^.[\]]+|\[\d+\]/g);
  if (segments === null) {
    return undefined;
  }

  let current: unknown = obj;
  for (const segment of segments) {
    if (current === undefined || current === null) {
      return undefined;
    }

    const indexMatch = /^\[(\d+)\]$/.exec(segment);
    if (indexMatch !== null) {
      const index = Number(indexMatch[1]);
      if (Array.isArray(current)) {
        current = current[index];
      } else {
        return undefined;
      }
    } else {
      if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[segment];
      } else {
        return undefined;
      }
    }
  }

  return current;
}
