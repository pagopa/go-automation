import { omitUndefined } from '@pagopa/go-common/utils';
import type {
  CoverageEntry,
  ErrorChainInterruptionReason,
  ErrorTreeNode,
  EvidenceIdentifierKind,
  IdentifierObservation,
  RunbookExecutionResult,
  TreeChain,
  TreeChainGroup,
} from '../../../engine/index.js';
import { canonicalReadIdentifier } from '../../../engine/internal.js';
import type { ErrorChainGroup } from './ErrorChainGroup.js';
import type { ErrorChainInterruption } from './ErrorChainInterruption.js';
import type { ErrorChainMember } from './ErrorChainMember.js';
import type { ErrorChainNode } from './ErrorChainNode.js';
import type { ErrorChainRoute } from './ErrorChainRoute.js';
import { ErrorTreeView } from './tree/ErrorTreeView.js';
import { mergeObservations } from './tree/mergeObservations.js';
import { earliest, latest } from './isEarlier.js';

/** Target of the single node of a window-level chain. */
const WINDOW_TARGET = 'window';

/** Members shown as samples of a group. */
const MAX_SAMPLES = 10;

/**
 * Builds the error chains of an execution.
 *
 * - A runbook with an error tree has the chains of its tree, grouped by the engine: each group keeps the nodes of its
 *   oldest member, the interruptions and routes of all its members, every member with its key and correlation, and
 *   the identifiers of its nodes.
 * - A window-level runbook evaluates its cases on the whole window: every detection is a chain of one node, with the
 *   time of its evidence. The chains keep the order of the detections, which is already the time order. A chain is
 *   incomplete when the window has a gap of the whole read, when a gap names an identifier the detection observed,
 *   or when the detection observed no identifier of the kinds the gaps name while some gap names identifiers.
 *
 * Complexity: O(N) over the nodes of the members, or O(D) over the detections.
 *
 * @param result - Result of the execution
 * @returns The chain groups, in time order; empty when there is nothing to report
 */
export function buildErrorChains(result: RunbookExecutionResult): ReadonlyArray<ErrorChainGroup> {
  return errorChainsOf(result, new ErrorTreeView(result));
}

/**
 * {@link buildErrorChains} with the view of the tree already built.
 *
 * @param result - Result of the execution
 * @param view - The view of its error tree
 * @returns The chain groups, in time order
 */
export function errorChainsOf(result: RunbookExecutionResult, view: ErrorTreeView): ReadonlyArray<ErrorChainGroup> {
  if (view.hasTree && result.chains !== undefined) return view.chains.map((group) => treeChainGroup(group, view));
  const named = namedIdentifiers(result.coverage);
  return result.detections.map((detection): ErrorChainGroup => ({
    nodes: [
      {
        level: 0,
        target: WINDOW_TARGET,
        label: detection.knownError.description,
        knownErrorCodes: [detection.knownError.code],
        status: 'recognized',
      },
    ],
    end: 'leaf',
    interruptions: [],
    incompleteEvidence: result.windowIncomplete || observesGap(detection.observations, named),
    count: 1,
    errors: 1,
    ...omitUndefined({ firstSeenAt: detection.firstSeenAt, lastSeenAt: detection.lastSeenAt }),
    routes: [],
    samples: [{ key: detection.knownError.code, correlation: {} }],
    members: [
      {
        key: detection.knownError.code,
        correlation: {},
        ...(detection.firstSeenAt !== undefined ? { occurredAt: detection.firstSeenAt } : {}),
      },
    ],
    observations: detection.observations,
  }));
}

/** The keys of the identifiers the gaps name, by kind. */
function namedIdentifiers(coverage: ReadonlyArray<CoverageEntry>): ReadonlyMap<EvidenceIdentifierKind, Set<string>> {
  const named = new Map<EvidenceIdentifierKind, Set<string>>();
  for (const entry of coverage) {
    for (const identifier of entry.identifiers ?? []) {
      const values = named.get(identifier.kind) ?? new Set<string>();
      values.add(identifier.value);
      named.set(identifier.kind, values);
    }
  }
  return named;
}

/**
 * Whether a detection may have missed evidence because of a gap that names identifiers: a gap names one of its
 * usable observations, or it has none (an observation of another kind, or not valid for its kind, is not usable).
 */
function observesGap(
  observations: ReadonlyArray<IdentifierObservation>,
  named: ReadonlyMap<EvidenceIdentifierKind, ReadonlySet<string>>,
): boolean {
  if (named.size === 0) return false;
  let usable = false;
  for (const observation of observations) {
    const values = named.get(observation.kind);
    const identifier = values === undefined ? undefined : canonicalReadIdentifier(observation);
    if (values === undefined || identifier === undefined) continue;
    if (values.has(identifier.value)) return true;
    usable = true;
  }
  return !usable;
}

/** A group of the error tree, as the output reports it. */
function treeChainGroup(group: TreeChainGroup, view: ErrorTreeView): ErrorChainGroup {
  const oldest = group.members[0];
  const nodes = oldest === undefined ? [] : view.chainNodes(oldest).map((node) => chainNode(node, view));
  const members = group.members.map((chain) => chainMember(chain, view));
  const firstSeenAt = earliest(group.members.map((chain) => chain.firstSeenAt));
  const lastSeenAt = latest(group.members.map((chain) => chain.lastSeenAt));
  return {
    nodes,
    end: oldest?.end ?? 'leaf',
    interruptions: interruptionsOf(group.members),
    incompleteEvidence: group.members.some((chain) => chain.incompleteEvidence),
    count: group.members.length,
    errors: view.distinctErrors(group.members),
    ...omitUndefined({ firstSeenAt, lastSeenAt }),
    routes: routesOf(members),
    samples: members.slice(0, MAX_SAMPLES).map(({ key, correlation }) => ({ key, correlation })),
    members,
    observations: observationsOf(group.members, view),
  };
}

/** A node of the tree as a node of a chain. */
function chainNode(node: ErrorTreeNode, view: ErrorTreeView): ErrorChainNode {
  const knownErrorCodes = node.detections.map((detection) => detection.knownError.code);
  const description = [...new Set(node.detections.map((detection) => detection.knownError.description))].join(' + ');
  return {
    level: node.level,
    target: node.target,
    label: node.label,
    ...(description !== '' && description !== node.label ? { description } : {}),
    knownErrorCodes,
    status: view.statusOf(node),
  };
}

/** A chain of the tree as a member of its group: the keys of its nodes, their correlation and the routes taken. */
function chainMember(chain: TreeChain, view: ErrorTreeView): ErrorChainMember {
  const nodes = view.chainNodes(chain);
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
function observationsOf(chains: ReadonlyArray<TreeChain>, view: ErrorTreeView): ReadonlyArray<IdentifierObservation> {
  const visited = new Set<string>();
  const candidates: IdentifierObservation[] = [];
  for (const chain of chains) {
    for (const node of view.chainNodes(chain)) {
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      for (const detection of node.detections) candidates.push(...detection.observations);
      candidates.push(...view.correlationObservations(node));
    }
  }
  return mergeObservations(candidates);
}
