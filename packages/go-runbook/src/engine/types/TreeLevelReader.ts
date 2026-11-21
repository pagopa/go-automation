import type { RunbookContext } from './RunbookContext.js';
import type { Step } from './Step.js';
import type { TreeLevelReadResult } from './TreeLevelReadResult.js';
import type { ReadIdentifier } from './ReadIdentifier.js';

/**
 * The grouped read of a level: one read for a batch of identifiers of the same kind, combined in `OR`. It is a step
 * (services, policy, digest see it), whose `execute` is never used by the engine.
 */
export interface TreeLevelReader extends Step<unknown> {
  read(context: RunbookContext, identifiers: ReadonlyArray<ReadIdentifier>): Promise<TreeLevelReadResult>;
}
