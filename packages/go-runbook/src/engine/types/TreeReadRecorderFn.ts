import type { TreeLevelReader } from './TreeLevelReader.js';
import type { TreeLevelReadResult } from './TreeLevelReadResult.js';
import type { TreeReadIdentifier } from './TreeReadIdentifier.js';

/** Records a grouped read of a level in the trace, and its coverage in the execution. */
export type TreeReadRecorderFn = (
  read: TreeLevelReader,
  identifiers: ReadonlyArray<TreeReadIdentifier>,
  result: TreeLevelReadResult,
  startedAtMs: number,
) => void;
