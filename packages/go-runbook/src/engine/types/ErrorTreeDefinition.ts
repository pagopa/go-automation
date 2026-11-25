import type { TreeLevel } from './TreeLevel.js';

/** The levels a runbook investigates: the root level, then one level per target it may descend to. */
export interface ErrorTreeDefinition {
  readonly root: TreeLevel;
  readonly levels: ReadonlyArray<TreeLevel>;
}
