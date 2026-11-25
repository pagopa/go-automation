import type { ErrorTreeNode } from './ErrorTreeNode.js';
import type { ObservedErrors } from './ObservedErrors.js';
import type { RunbookContext } from './RunbookContext.js';

/** The investigated error tree, with the final context of every node. */
export interface ErrorTreeRun {
  /** Parents before children. */
  readonly nodes: ReadonlyArray<ErrorTreeNode>;
  readonly contexts: ReadonlyMap<string, RunbookContext>;
  readonly observedErrors?: ObservedErrors;
}
