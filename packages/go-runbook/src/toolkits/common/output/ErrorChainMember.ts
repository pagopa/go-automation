import type { ErrorChainSample } from './ErrorChainSample.js';

/** A chain of a group, with what the comparison with a human analysis needs. */
export interface ErrorChainMember extends ErrorChainSample {
  /** For each step from a node to the next, the services traversed. */
  readonly via?: ReadonlyArray<ReadonlyArray<string>>;
  /** Earliest time of the chain. */
  readonly occurredAt?: string;
}
