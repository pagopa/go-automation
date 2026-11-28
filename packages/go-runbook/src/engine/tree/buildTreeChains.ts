import type { ErrorChainInterruptionReason } from '../types/ErrorChainInterruptionReason.js';
import type { ErrorTreeNode } from '../types/ErrorTreeNode.js';
import type { TreeChain } from '../types/TreeChain.js';
import type { TreeChainGroup } from '../types/TreeChainGroup.js';
import type { ReadState } from '../types/ReadState.js';
import type { TreeChainEnd } from '../types/TreeChainEnd.js';
import type { TreeChainInterruption } from '../types/TreeChainInterruption.js';
import { compareByFirstMs } from '../core/compareByFirstMs.js';

/** A chain being built, with its time in milliseconds. */
interface TimedChain {
  readonly chain: TreeChain;
  readonly firstMs?: number;
}

/**
 * The chains of an error tree, grouped.
 *
 * A chain goes from a root node down to where the investigation ended: a true leaf (no descent requested, or every
 * descent a complete read without errors) or an interruption. Each requested descent that brought no child ends a
 * chain of its own when it is not a complete read (`skipped`, `unavailable`, `incomplete`, `cycle`); a failed node
 * ends its chain as `failed`. A chain has incomplete evidence when the window read, or a read on its path, is
 * incomplete.
 *
 * Chains with the same sequence of `(target, cases)`, the same end and the same interruption reason are one group.
 * Groups are ordered by their earliest time, then by the declaration order of their cases; untimed groups last.
 *
 * Complexity: O(N log N) over the nodes.
 *
 * @param nodes - Nodes of the tree, parents before children
 * @param windowIncomplete - Whether the window has a gap of the whole read
 * @param caseOrder - Declaration index of each case
 * @returns The groups, in time order
 *
 * @example
 * ```typescript
 * const groups = buildTreeChains(result.tree ?? [], result.windowIncomplete, caseOrder);
 * ```
 */
export function buildTreeChains(
  nodes: ReadonlyArray<ErrorTreeNode>,
  windowIncomplete: boolean,
  caseOrder: ReadonlyMap<string, number>,
): ReadonlyArray<TreeChainGroup> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const chains: TimedChain[] = [];
  for (const node of nodes) {
    if (node.parentId === undefined) collectChains(node, [], windowIncomplete, byId, chains);
  }

  const groups = new Map<string, TimedChain[]>();
  for (const timed of chains) {
    const key = groupKey(timed.chain, byId);
    const members = groups.get(key) ?? [];
    members.push(timed);
    groups.set(key, members);
  }

  return [...groups.entries()]
    .map(([key, members]) => {
      const ordered = [...members].sort(compareByFirstMs);
      return {
        key,
        members: ordered.map((member) => member.chain),
        firstMs: ordered[0]?.firstMs,
        order: caseRank(ordered[0]?.chain, byId, caseOrder),
      };
    })
    .sort((a, b) => compareByFirstMs(a, b) || compareRanks(a.order, b.order))
    .map(({ key, members }) => ({ key, members }));
}

/** Walks the tree from a node, adding a chain for every path that ends. */
function collectChains(
  node: ErrorTreeNode,
  path: ReadonlyArray<string>,
  incompleteAbove: boolean,
  byId: ReadonlyMap<string, ErrorTreeNode>,
  into: TimedChain[],
): void {
  const nodeIds = [...path, node.id];
  const incomplete = incompleteAbove || node.incompleteEvidence === true;
  // A failed node ends its chain; the branches it already investigated below stay, each with its own end.
  let ended = false;
  if (node.status === 'failed') {
    into.push(timedChain(nodeIds, 'interrupted', { reason: 'failed', target: node.target }, incomplete, byId));
    ended = true;
  }
  for (const descent of node.descents) {
    // Any read of a descent that is not complete leaves its children incomplete, even when it returned rows.
    const readIncomplete = incomplete || descent.incompleteVia === true || descent.state !== 'queried';
    if (descent.childIds.length > 0) {
      for (const childId of descent.childIds) {
        const child = byId.get(childId);
        if (child !== undefined) collectChains(child, nodeIds, readIncomplete, byId, into);
      }
      ended = true;
      continue;
    }
    const reason = interruptionOf(descent.state);
    if (reason === undefined) continue;
    into.push(timedChain(nodeIds, 'interrupted', { reason, target: descent.target }, readIncomplete, byId));
    ended = true;
  }
  if (!ended) into.push(timedChain(nodeIds, 'leaf', undefined, incomplete, byId));
}

/** Why a descent without children interrupts the chain; nothing for a complete read without errors. */
function interruptionOf(state: ReadState): ErrorChainInterruptionReason | undefined {
  switch (state) {
    case 'queried':
      return undefined;
    case 'saturated':
      return 'incomplete';
    case 'unavailable':
    case 'skipped':
    case 'cycle':
      return state;
    default: {
      const exhaustive: never = state;
      throw new Error(`Unknown descent state: ${String(exhaustive)}`);
    }
  }
}

/** A chain with the time range of its nodes and of the evidence of their cases. */
function timedChain(
  nodeIds: ReadonlyArray<string>,
  end: TreeChainEnd,
  interruption: TreeChainInterruption | undefined,
  incompleteEvidence: boolean,
  byId: ReadonlyMap<string, ErrorTreeNode>,
): TimedChain {
  let firstMs: number | undefined;
  let lastMs: number | undefined;
  const offer = (iso: string | undefined): void => {
    if (iso === undefined) return;
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) return;
    firstMs = firstMs === undefined ? ms : Math.min(firstMs, ms);
    lastMs = lastMs === undefined ? ms : Math.max(lastMs, ms);
  };
  // A chain happens when its root error happened; without that time, when the evidence of its nodes did.
  offer(byId.get(nodeIds[0] ?? '')?.occurredAt);
  if (firstMs === undefined) {
    for (const id of nodeIds) {
      const node = byId.get(id);
      offer(node?.occurredAt);
      for (const detection of node?.detections ?? []) {
        offer(detection.firstSeenAt);
        offer(detection.lastSeenAt);
      }
    }
  }
  return {
    chain: {
      nodeIds,
      end,
      ...(interruption !== undefined ? { interruption } : {}),
      incompleteEvidence,
      ...(firstMs !== undefined ? { firstSeenAt: new Date(firstMs).toISOString() } : {}),
      ...(lastMs !== undefined ? { lastSeenAt: new Date(lastMs).toISOString() } : {}),
    },
    ...(firstMs !== undefined ? { firstMs } : {}),
  };
}

/** The grouping key: `(target, cases)` of every node, the end and the interruption reason. */
function groupKey(chain: TreeChain, byId: ReadonlyMap<string, ErrorTreeNode>): string {
  const nodes = chain.nodeIds.map((id) => {
    const node = byId.get(id);
    const knownErrorCodes = (node?.detections ?? []).map((detection) => detection.knownError.code).sort();
    return `${node?.target ?? '?'}=${knownErrorCodes.length > 0 ? knownErrorCodes.join('+') : '?'}`;
  });
  return `${nodes.join('>')}|${chain.end}|${chain.interruption?.reason ?? ''}`;
}

/** Earliest declaration index of the cases of a chain; unrecognized chains last. */
function caseRank(
  chain: TreeChain | undefined,
  byId: ReadonlyMap<string, ErrorTreeNode>,
  caseOrder: ReadonlyMap<string, number>,
): number {
  let rank = Number.POSITIVE_INFINITY;
  for (const id of chain?.nodeIds ?? []) {
    for (const detection of byId.get(id)?.detections ?? []) {
      rank = Math.min(rank, caseOrder.get(detection.knownError.code) ?? Number.POSITIVE_INFINITY);
    }
  }
  return rank;
}

/** Lower rank first; `0` on ties, infinite ranks included. */
function compareRanks(a: number, b: number): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
