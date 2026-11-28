import type {
  IdentifierObservation,
  KnownErrorDetection,
  RunbookContext,
  RunbookExecutionResult,
} from '../../../engine/index.js';
import type { ErrorTreeView } from './tree/ErrorTreeView.js';
import { mergeObservations } from './tree/mergeObservations.js';

/**
 * The context of a node as the output reads it: its own variables, with the step results of the window and of every
 * node of its path, the node's own last.
 */
function nodeOutputContext(result: RunbookExecutionResult, view: ErrorTreeView, nodeId: string): RunbookContext {
  const own = result.nodeContexts?.get(nodeId);
  if (own === undefined) return result.finalContext;
  const stepResults = new Map(result.finalContext.stepResults);
  for (const node of view.path(nodeId)) {
    for (const [stepId, output] of result.nodeContexts?.get(node.id)?.stepResults ?? [])
      stepResults.set(stepId, output);
  }
  return { ...own, stepResults };
}

/**
 * The context a detection was recognized in: the context of its node for a detection of the tree, the final context
 * for a detection of the window.
 *
 * @param result - Result of the execution
 * @param view - The view of its error tree
 * @param detection - A detection of the result
 * @returns The context of the detection
 */
export function detectionContext(
  result: RunbookExecutionResult,
  view: ErrorTreeView,
  detection: KnownErrorDetection,
): RunbookContext {
  const node = view.nodeOf(detection);
  return node === undefined ? result.finalContext : nodeOutputContext(result, view, node.id);
}

/**
 * The identifiers of a detection: those read from its evidence and those of the correlation of its node and of the
 * node's ancestors, each with its earliest time, in time order.
 *
 * @param view - The view of the error tree of the execution
 * @param detection - A detection of the result
 * @returns The observations
 */
export function detectionObservations(
  view: ErrorTreeView,
  detection: KnownErrorDetection,
): ReadonlyArray<IdentifierObservation> {
  const node = view.nodeOf(detection);
  const path = node === undefined ? [] : [...view.path(node.id)].reverse();
  return mergeObservations([
    ...detection.observations,
    ...path.flatMap((ancestor) => view.correlationObservations(ancestor)),
  ]);
}

/**
 * The context the output describes: the context of the last node of the first chain, or the final context without a
 * tree.
 *
 * @param result - Result of the execution
 * @param view - The view of its error tree
 * @returns The representative context
 */
export function representativeContext(result: RunbookExecutionResult, view: ErrorTreeView): RunbookContext {
  const node = view.representative();
  return node === undefined ? result.finalContext : nodeOutputContext(result, view, node.id);
}
