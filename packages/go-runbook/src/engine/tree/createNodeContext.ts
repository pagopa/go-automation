import type { ErrorNodeSpec } from '../types/ErrorNodeSpec.js';
import type { RunbookContext } from '../types/RunbookContext.js';
import { relatedRowsKey } from './relatedRowsKey.js';

/**
 * The isolated context of an error node: the context of its parent (or of the window), without the rows of the
 * parent's level, with the variables of the node and, for every step it scopes, only its own rows. The related rows
 * of a scoped step (`steps.<id>.context`, `steps.<id>.siblings`) are the node's, or none. A node reads the variables
 * of its ancestors, never their rows.
 *
 * The parent context is copied, never modified: what the node's steps write stays in the node.
 *
 * @param base - Context of the parent, or of the window for a root node
 * @param spec - The node, as the enumerator produced it
 * @param hiddenSteps - Steps whose rows belong to the parent's level
 * @returns The context of the node
 *
 * @example
 * ```typescript
 * const context = createNodeContext(window, { key: 'req-1', label: '500', scopedOutputs: { 'query-logs': [row] } });
 * ```
 */
export function createNodeContext(
  base: RunbookContext,
  spec: ErrorNodeSpec,
  hiddenSteps: ReadonlyArray<string> = [],
): RunbookContext {
  const stepResults = new Map(base.stepResults);
  for (const stepId of hiddenSteps) {
    stepResults.delete(stepId);
    stepResults.delete(relatedRowsKey(stepId, 'context'));
    stepResults.delete(relatedRowsKey(stepId, 'siblings'));
  }
  for (const [stepId, rows] of Object.entries(spec.scopedOutputs)) {
    stepResults.set(stepId, rows);
    stepResults.set(relatedRowsKey(stepId, 'context'), spec.contextOutputs?.[stepId] ?? []);
    stepResults.set(relatedRowsKey(stepId, 'siblings'), spec.siblingOutputs?.[stepId] ?? []);
  }
  const vars = new Map(base.vars);
  for (const [name, value] of Object.entries(spec.vars ?? {})) vars.set(name, value);
  return { ...base, stepResults, vars };
}
