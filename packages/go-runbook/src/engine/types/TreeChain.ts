import type { TreeChainEnd } from './TreeChainEnd.js';
import type { TreeChainInterruption } from './TreeChainInterruption.js';

/** A path of the error tree, from a root node down to where the investigation ended. */
export interface TreeChain {
  /** Node ids, root first. */
  readonly nodeIds: ReadonlyArray<string>;
  readonly end: TreeChainEnd;
  readonly interruption?: TreeChainInterruption;
  /** A read on the path, or the read of the window, did not see all the evidence. */
  readonly incompleteEvidence: boolean;
  /** Earliest time of the chain: its nodes and the evidence of their cases. */
  readonly firstSeenAt?: string;
  readonly lastSeenAt?: string;
}
