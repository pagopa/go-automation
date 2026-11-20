import type { ErrorTreeNode } from '../../../engine/types/ErrorTreeNode.js';
import type { IdentifierObservation } from '../../../engine/types/IdentifierObservation.js';
import type { EvidenceIdentifierKind } from '../../../engine/types/EvidenceIdentifierKind.js';
import type { RunbookExecutionResult } from '../../../engine/types/RunbookExecutionResult.js';
import type { TreeChain } from '../../../engine/types/TreeChain.js';
import type { TreeChainGroup } from '../../../engine/types/TreeChainGroup.js';
import type { ErrorChainGroup } from './ErrorChainGroup.js';
import type { ErrorChainInterruption } from './ErrorChainInterruption.js';
import type { ErrorChainInterruptionReason } from '../../../engine/types/ErrorChainInterruptionReason.js';
import type { ErrorChainMember } from './ErrorChainMember.js';
import type { ErrorChainNode } from './ErrorChainNode.js';
import type { ErrorChainRoute } from './ErrorChainRoute.js';

/** Target of the single node of a window-level chain. */
const WINDOW_TARGET = 'window';

/** Members shown as samples of a group. */
const MAX_SAMPLES = 10;

/** Correlation keys that are typed identifiers, with their kind. */
const CORRELATION_KINDS: ReadonlyMap<string, EvidenceIdentifierKind> = new Map([
  ['requestId', 'requestId'],
  ['traceId', 'traceId'],
  ['fallbackUuid', 'fallbackUuid'],
]);

/**
 * Builds the error chains of an execution.
 *
 * - A runbook with an error tree has the chains of its tree, grouped by the engine: each group keeps the nodes of its
 *   oldest member, the interruptions and routes of all its members, every member with its key and correlation, and
 *   the identifiers of its nodes.
 * - A window-level runbook evaluates its cases on the whole window: every detection is a chain of one node, with the
 *   time of its evidence. The chains keep the order of the detections, which is already the time order.
 *
 * Complexity: O(N) over the nodes of the members, or O(D) over the detections.
 *
 * @param result - Result of the execution
 * @returns The chain groups, in time order; empty when there is nothing to report
 */
export function buildErrorChains(result: RunbookExecutionResult): ReadonlyArray<ErrorChainGroup> {
  if (result.tree !== undefined && result.chains !== undefined) {
    const byId = new Map(result.tree.map((node) => [node.id, node]));
    return result.chains.map((group) => treeChainGroup(group, byId));
  }
  const incompleteEvidence = result.coverage.length > 0;
  return result.detections.map((detection): ErrorChainGroup => ({
    nodes: [
      {
        level: 0,
        target: WINDOW_TARGET,
        label: detection.knownCase.description,
        caseIds: [detection.knownCase.id],
        status: 'recognized',
      },
    ],
    end: 'leaf',
    interruptions: [],
    incompleteEvidence,
    count: 1,
    ...(detection.firstSeenAt !== undefined ? { firstSeenAt: detection.firstSeenAt } : {}),
    ...(detection.lastSeenAt !== undefined ? { lastSeenAt: detection.lastSeenAt } : {}),
    routes: [],
    samples: [{ key: detection.knownCase.id, correlation: {} }],
    members: [
      {
        key: detection.knownCase.id,
        correlation: {},
        ...(detection.firstSeenAt !== undefined ? { occurredAt: detection.firstSeenAt } : {}),
      },
    ],
    observations: detection.observations,
  }));
}

/** A group of the error tree, as the output reports it. */
function treeChainGroup(group: TreeChainGroup, byId: ReadonlyMap<string, ErrorTreeNode>): ErrorChainGroup {
  const oldest = group.members[0];
  const nodes = (oldest?.nodeIds ?? []).flatMap((id) => {
    const node = byId.get(id);
    return node === undefined ? [] : [chainNode(node)];
  });
  const members = group.members.map((chain) => chainMember(chain, byId));
  const firstSeenAt = earliest(group.members.map((chain) => chain.firstSeenAt));
  const lastSeenAt = latest(group.members.map((chain) => chain.lastSeenAt));
  return {
    nodes,
    end: oldest?.end ?? 'leaf',
    interruptions: interruptionsOf(group.members),
    incompleteEvidence: group.members.some((chain) => chain.incompleteEvidence),
    count: group.members.length,
    ...(firstSeenAt !== undefined ? { firstSeenAt } : {}),
    ...(lastSeenAt !== undefined ? { lastSeenAt } : {}),
    routes: routesOf(members),
    samples: members.slice(0, MAX_SAMPLES).map(({ key, correlation }) => ({ key, correlation })),
    members,
    observations: observationsOf(group.members, byId),
  };
}

/** A node of the tree as a node of a chain. */
function chainNode(node: ErrorTreeNode): ErrorChainNode {
  const caseIds = node.detections.map((detection) => detection.knownCase.id);
  const description = [...new Set(node.detections.map((detection) => detection.knownCase.description))].join(' + ');
  return {
    level: node.level,
    target: node.target,
    label: node.label,
    ...(description !== '' && description !== node.label ? { description } : {}),
    caseIds,
    status: node.status === 'failed' ? 'failed' : caseIds.length > 0 ? 'recognized' : 'unrecognized',
  };
}

/** A chain of the tree as a member of its group: the keys of its nodes, their correlation and the routes taken. */
function chainMember(chain: TreeChain, byId: ReadonlyMap<string, ErrorTreeNode>): ErrorChainMember {
  const nodes = chain.nodeIds.flatMap((id) => {
    const node = byId.get(id);
    return node === undefined ? [] : [node];
  });
  const correlation: Record<string, string> = {};
  for (const node of nodes) {
    for (const [key, value] of Object.entries(node.correlation)) correlation[key] ??= value;
  }
  const via = nodes.slice(1).map((node) => node.via ?? []);
  return {
    key: nodes.map((node) => node.key).join(' > '),
    correlation,
    ...(via.some((step) => step.length > 0) ? { via } : {}),
    ...(chain.firstSeenAt !== undefined ? { occurredAt: chain.firstSeenAt } : {}),
  };
}

/** The interruptions of the members, counted by reason and target. */
function interruptionsOf(chains: ReadonlyArray<TreeChain>): ReadonlyArray<ErrorChainInterruption> {
  const counts = new Map<string, { reason: ErrorChainInterruptionReason; target?: string; count: number }>();
  for (const chain of chains) {
    const interruption = chain.interruption;
    if (interruption === undefined) continue;
    const key = `${interruption.reason}|${interruption.target ?? ''}`;
    const entry = counts.get(key) ?? {
      reason: interruption.reason,
      ...(interruption.target !== undefined ? { target: interruption.target } : {}),
      count: 0,
    };
    entry.count += 1;
    counts.set(key, entry);
  }
  return [...counts.values()];
}

/** The distinct routes of the members that traversed a service, with how many members took each. */
function routesOf(members: ReadonlyArray<ErrorChainMember>): ReadonlyArray<ErrorChainRoute> {
  const routes = new Map<string, { via: ReadonlyArray<ReadonlyArray<string>>; count: number }>();
  for (const member of members) {
    if (member.via === undefined) continue;
    const key = JSON.stringify(member.via);
    const route = routes.get(key) ?? { via: member.via, count: 0 };
    route.count += 1;
    routes.set(key, route);
  }
  return [...routes.values()];
}

/**
 * The identifiers of the members: those read from the evidence of their cases and those of the correlation of their
 * nodes, each with its earliest time.
 */
function observationsOf(
  chains: ReadonlyArray<TreeChain>,
  byId: ReadonlyMap<string, ErrorTreeNode>,
): ReadonlyArray<IdentifierObservation> {
  const observations = new Map<string, IdentifierObservation>();
  const offer = (observation: IdentifierObservation): void => {
    const key = `${observation.kind}:${observation.value}`;
    const previous = observations.get(key);
    if (previous !== undefined && !isEarlier(observation.observedAt, previous.observedAt)) return;
    observations.set(key, observation);
  };
  const visited = new Set<string>();
  for (const chain of chains) {
    for (const id of chain.nodeIds) {
      const node = byId.get(id);
      if (node === undefined || visited.has(id)) continue;
      visited.add(id);
      for (const detection of node.detections) for (const observation of detection.observations) offer(observation);
      for (const [key, value] of Object.entries(node.correlation)) {
        const kind = CORRELATION_KINDS.get(key);
        if (kind === undefined || value === '') continue;
        offer({ kind, value, ...(node.occurredAt !== undefined ? { observedAt: node.occurredAt } : {}) });
      }
    }
  }
  return [...observations.values()].sort((a, b) =>
    isEarlier(a.observedAt, b.observedAt) ? -1 : isEarlier(b.observedAt, a.observedAt) ? 1 : 0,
  );
}

/** Whether a time comes before another; an untimed one never does, and is preceded by any timed one. */
function isEarlier(candidate: string | undefined, other: string | undefined): boolean {
  if (candidate === undefined) return false;
  if (other === undefined) return true;
  return Date.parse(candidate) < Date.parse(other);
}

/** The earliest of some ISO times. */
function earliest(times: ReadonlyArray<string | undefined>): string | undefined {
  let best: string | undefined;
  for (const time of times) if (isEarlier(time, best)) best = time;
  return best;
}

/** The latest of some ISO times. */
function latest(times: ReadonlyArray<string | undefined>): string | undefined {
  let best: string | undefined;
  for (const time of times) {
    if (time !== undefined && (best === undefined || Date.parse(time) > Date.parse(best))) best = time;
  }
  return best;
}
