import type { EvidenceIdentifier } from './EvidenceIdentifier.js';

/**
 * A request, made by a node, to look for the errors of the same operation one level below. An empty identifier
 * says the node should descend but has nothing to look up with: the chain is interrupted as `skipped`.
 */
export interface DescendRequest {
  /** Target level to read: a service, a log group, a downstream. */
  readonly target: string;
  /** Identifier to look up in the target; empty when the node has none. */
  readonly identifier: EvidenceIdentifier;
  /** Services traversed without errors on the way (`via pn-external-registries`), set by a route. */
  readonly via?: ReadonlyArray<string>;
}
