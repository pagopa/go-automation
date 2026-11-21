import type { TreeLevelReader } from './TreeLevelReader.js';
import type { TreeLevelReadResult } from './TreeLevelReadResult.js';
import type { ReadIdentifier } from './ReadIdentifier.js';

/** Records a grouped read of a level in the trace. */
export type TreeReadRecorderFn = (
  read: TreeLevelReader,
  identifiers: ReadonlyArray<ReadIdentifier>,
  result: TreeLevelReadResult,
  startedAtMs: number,
) => void;
