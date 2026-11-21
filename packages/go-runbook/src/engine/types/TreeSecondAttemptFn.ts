import type { ReadIdentifier } from './ReadIdentifier.js';

/**
 * A second read of the same level for the same parent (for example a trace id found by the fallback UUID read):
 * the rows of the two attempts are merged by row identity. It is not a descent.
 */
export type TreeSecondAttemptFn = (
  rows: ReadonlyArray<unknown>,
  identifier: ReadIdentifier,
) => ReadIdentifier | undefined;
