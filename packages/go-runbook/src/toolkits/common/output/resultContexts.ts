import type { KnownCaseDetection } from '../../../engine/types/KnownCaseDetection.js';
import type { RunbookContext } from '../../../engine/types/RunbookContext.js';
import type { RunbookExecutionResult } from '../../../engine/types/RunbookExecutionResult.js';
import type { ErrorTreeNode } from '../../../engine/types/ErrorTreeNode.js';
import type { EvidenceIdentifierKind } from '../../../engine/types/EvidenceIdentifierKind.js';
import type { IdentifierObservation } from '../../../engine/types/IdentifierObservation.js';

/**
 * The context of an error node as the output reads it: the variables of the node, and the rows of the window and of
 * every node from the root down to it.
 *
 * @param result - Result of the execution
 * @param nodeId - Node of the error tree
 * @returns The context, or the final context of the window when the node is unknown
 */
function nodeOutputContext(result: RunbookExecutionResult, nodeId: string): RunbookContext {
  const { nodes } = treeIndex(result);
  const path: string[] = [];
  for (let id: string | undefined = nodeId; id !== undefined; id = nodes.get(id)?.parentId) path.unshift(id);
  const own = result.nodeContexts?.get(nodeId);
  if (own === undefined) return result.finalContext;
  const stepResults = new Map(result.finalContext.stepResults);
  for (const id of path) {
    for (const [stepId, output] of result.nodeContexts?.get(id)?.stepResults ?? []) stepResults.set(stepId, output);
  }
  return { ...own, stepResults };
}

/**
 * The context a detection is rendered with: in an error tree, the context of the node that recognized it.
 *
 * @param result - Result of the execution
 * @param detection - One of the detections of the result
 * @returns The context of its node, or the final context of a window-level runbook
 */
export function detectionContext(result: RunbookExecutionResult, detection: KnownCaseDetection): RunbookContext {
  const node = detectionNode(result, detection);
  return node === undefined ? result.finalContext : nodeOutputContext(result, node.id);
}

/**
 * The node of the error tree that recognized a detection.
 *
 * @param result - Result of the execution
 * @param detection - One of the detections of the result
 * @returns The node, or nothing for a window-level runbook
 */
function detectionNode(result: RunbookExecutionResult, detection: KnownCaseDetection): ErrorTreeNode | undefined {
  return treeIndex(result).byDetection.get(detection);
}

/** Lookups of the nodes of an error tree, by id and by detection. */
interface TreeIndex {
  readonly nodes: ReadonlyMap<string, ErrorTreeNode>;
  readonly byDetection: ReadonlyMap<KnownCaseDetection, ErrorTreeNode>;
}

/** The index of each result, built once for every output built from it. */
const TREE_INDEXES = new WeakMap<RunbookExecutionResult, TreeIndex>();

/** The lookups of the nodes of the tree of a result. */
function treeIndex(result: RunbookExecutionResult): TreeIndex {
  const cached = TREE_INDEXES.get(result);
  if (cached !== undefined) return cached;
  const tree = result.tree ?? [];
  const index: TreeIndex = {
    nodes: new Map(tree.map((node) => [node.id, node])),
    byDetection: new Map(tree.flatMap((node) => node.detections.map((detection) => [detection, node] as const))),
  };
  TREE_INDEXES.set(result, index);
  return index;
}

/**
 * The identifiers of a detection: those of its evidence and, in an error tree, those of the correlation of its node
 * and of its ancestors; never those of another occurrence of the same case.
 *
 * @param result - Result of the execution
 * @param detection - One of the detections of the result
 * @returns The observations
 */
export function detectionObservations(
  result: RunbookExecutionResult,
  detection: KnownCaseDetection,
): ReadonlyArray<IdentifierObservation> {
  const observations = new Map(
    detection.observations.map((observation) => [`${observation.kind}:${observation.value}`, observation]),
  );
  const { nodes } = treeIndex(result);
  for (
    let node = detectionNode(result, detection);
    node !== undefined;
    node = node.parentId === undefined ? undefined : nodes.get(node.parentId)
  ) {
    for (const [key, value] of Object.entries(node.correlation)) {
      const kind = CORRELATION_KINDS.get(key);
      if (kind === undefined || observations.has(`${kind}:${value}`)) continue;
      observations.set(`${kind}:${value}`, {
        kind,
        value,
        ...(node.occurredAt !== undefined ? { observedAt: node.occurredAt } : {}),
      });
    }
  }
  return [...observations.values()];
}

const CORRELATION_KINDS: ReadonlyMap<string, EvidenceIdentifierKind> = new Map([
  ['requestId', 'requestId'],
  ['traceId', 'traceId'],
  ['fallbackUuid', 'fallbackUuid'],
]);

/**
 * The context that represents an execution in its output: in an error tree, the last node of the oldest chain.
 *
 * @param result - Result of the execution
 * @returns The context, or the final context of a window-level runbook
 */
export function representativeContext(result: RunbookExecutionResult): RunbookContext {
  const nodeIds = result.chains?.[0]?.members[0]?.nodeIds ?? [];
  const last = nodeIds[nodeIds.length - 1];
  return last === undefined ? result.finalContext : nodeOutputContext(result, last);
}
