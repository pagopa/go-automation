import type { TreeLevelReader } from './TreeLevelReader.js';
import type { TreeLevelReadResult } from './TreeLevelReadResult.js';
import type { EvidenceIdentifier } from './EvidenceIdentifier.js';

/** Records a grouped read of a level in the trace. */
export type TreeReadRecorderFn = (
  read: TreeLevelReader,
  identifiers: ReadonlyArray<EvidenceIdentifier>,
  result: TreeLevelReadResult,
  startedAtMs: number,
) => void;
