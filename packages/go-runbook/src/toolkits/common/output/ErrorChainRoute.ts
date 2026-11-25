/** A way the chains of a group went from node to node: the services traversed without errors at each step. */
export interface ErrorChainRoute {
  /** For each step from a node to the next, the services traversed («via pn-external-registries»). */
  readonly via: ReadonlyArray<ReadonlyArray<string>>;
  /** Chains of the group that went this way. */
  readonly count: number;
}
