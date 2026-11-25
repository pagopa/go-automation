import type { TreeChain } from './TreeChain.js';

/**
 * Identical chains: the same sequence of `(target, cases)`, the same end and the same interruption reason. The
 * members are in time order, untimed members last.
 */
export interface TreeChainGroup {
  readonly key: string;
  readonly members: ReadonlyArray<TreeChain>;
}
