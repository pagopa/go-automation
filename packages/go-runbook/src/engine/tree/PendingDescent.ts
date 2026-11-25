import type { TreeLevel } from '../types/TreeLevel.js';
import type { TreeLevelReader } from '../types/TreeLevelReader.js';
import type { WorkDescent } from './WorkDescent.js';
import type { WorkNode } from './WorkNode.js';

/** A descent waiting for its read. */
export interface PendingDescent {
  readonly node: WorkNode;
  readonly descent: WorkDescent;
  readonly level: TreeLevel;
  readonly reader: TreeLevelReader;
}
