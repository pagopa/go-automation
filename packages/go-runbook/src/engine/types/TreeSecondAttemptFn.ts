import type { TreeReadIdentifier } from './TreeReadIdentifier.js';

/**
 * A second read of the same level for the same parent (for example a trace id found by the fallback UUID read):
 * the rows of the two attempts are merged by row identity. It is not a descent.
 */
export type TreeSecondAttemptFn = (
  rows: ReadonlyArray<unknown>,
  identifier: TreeReadIdentifier,
) => TreeReadIdentifier | undefined;
