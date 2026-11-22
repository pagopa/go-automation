import { navigateFieldPath } from '@pagopa/go-common/json';
import type { RunbookContext } from '../types/RunbookContext.js';
import { relatedRowsKey } from '../tree/relatedRowsKey.js';

/**
 * Resolves a dot-separated reference string against the runbook context.
 *
 * Supported formats:
 * - `'vars.{name}'`                    - context variable
 * - `'params.{name}'`                  - input parameter
 * - `'steps.{stepId}.output'`          - step output
 * - `'steps.{stepId}.output.field'`    - nested step output field
 * - `'steps.{stepId}.output[0].field'` - array-indexed step output
 * - `'steps.{stepId}.context'`         - related rows of an error node that are not errors
 * - `'steps.{stepId}.siblings'`        - other error rows of the same identifier, in an error node
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
    const remainingPath = parts.slice(2).join('.');
    // The related rows of an error node: its context rows and its sibling error rows.
    if (remainingPath === 'context' || remainingPath === 'siblings') {
      const related = context.stepResults.get(relatedRowsKey(stepId, remainingPath));
      if (remainingPath === 'context' && related !== undefined) return related;
      // The siblings never include the rows of the node itself.
      if (Array.isArray(related)) {
        const own = context.stepResults.get(stepId);
        if (!Array.isArray(own)) return related;
        const ownRows = new Set<unknown>(own);
        return related.filter((row: unknown) => !ownRows.has(row));
      }
    }

    const stepOutput = context.stepResults.get(stepId);
    if (stepOutput === undefined) {
      return undefined;
    }

    if (remainingPath === '' || remainingPath === 'output') {
      return stepOutput;
    }

    const fieldPath = remainingPath.startsWith('output.') ? remainingPath.slice('output.'.length) : remainingPath;

    return navigateFieldPath(stepOutput, fieldPath);
  }

  return undefined;
}
