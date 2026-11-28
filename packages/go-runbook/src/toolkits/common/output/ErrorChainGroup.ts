import type { IdentifierObservation } from '../../../engine/index.js';
import type { ErrorChainInterruption } from './ErrorChainInterruption.js';
import type { ErrorChainNode } from './ErrorChainNode.js';
import type { ErrorChainMember } from './ErrorChainMember.js';
import type { ErrorChainRoute } from './ErrorChainRoute.js';
import type { ErrorChainSample } from './ErrorChainSample.js';

/**
 * A group of identical error chains: from a root error down to a leaf, with the known error of each node.
 *
 * Chains with the same sequence of `(target, knownErrorCodes)`, the same end and the same interruption are merged, with the
 * count and the time range. A window-level runbook has chains of one node, one per detected case.
 */
export interface ErrorChainGroup {
  readonly nodes: ReadonlyArray<ErrorChainNode>;
  readonly end: 'leaf' | 'interrupted';
  /** Every interruption of the members of the group, with its count. */
  readonly interruptions: ReadonlyArray<ErrorChainInterruption>;
  /** `true` when at least one member has incomplete evidence. */
  readonly incompleteEvidence: boolean;
  /** Chains merged in this group. */
  readonly count: number;
  readonly errors: number;
  /** Absent for window-level chains whose evidence has no time. */
  readonly firstSeenAt?: string;
  readonly lastSeenAt?: string;
  /** The ways the chains went from node to node; not part of the grouping key. Empty when no service was traversed. */
  readonly routes: ReadonlyArray<ErrorChainRoute>;
  /** Keys and correlation of the first chains of the group, at most 10, for display. */
  readonly samples: ReadonlyArray<ErrorChainSample>;
  /** Every chain of the group; kept in the complete output, for the comparison with a human analysis. */
  readonly members: ReadonlyArray<ErrorChainMember>;
  /** Typed identifiers read from the evidence of the group, each with its own time. */
  readonly observations: ReadonlyArray<IdentifierObservation>;
}
