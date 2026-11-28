import type { ReadScope } from '../reads/ReadScope.js';
import type { BranchOutcome } from '../types/BranchOutcome.js';
import type { ErrorNodeSpec } from '../types/ErrorNodeSpec.js';
import type { KnownErrorDetection } from '../types/KnownErrorDetection.js';
import type { RunbookContext } from '../types/RunbookContext.js';
import type { TreeLevel } from '../types/TreeLevel.js';
import type { NodeReads } from './NodeReads.js';
import type { WorkDescent } from './WorkDescent.js';

/** A node while the tree is investigated. */
export interface WorkNode {
  readonly id: string;
  readonly parentId?: string;
  readonly depth: number;
  readonly level: TreeLevel;
  readonly spec: ErrorNodeSpec;
  readonly errorKey: string;
  readonly scope: ReadScope;
  readonly via?: ReadonlyArray<string>;
  context: RunbookContext;
  failure?: string;
  readonly descents: WorkDescent[];
  /** `target|kind|identifier` of the descents that led to this node: a chain never repeats one. */
  readonly pathKeys: ReadonlySet<string>;
  /** Identities of the rows of this node and of its ancestors. */
  readonly pathRows: ReadonlySet<string>;
  detections: ReadonlyArray<KnownErrorDetection>;
  branchOutcome: BranchOutcome;
  /** The reads of each level for this node so far: rows, excluded diagnoses seen. */
  readonly reads: Map<string, NodeReads>;
}
