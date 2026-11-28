import type { BranchOutcome } from './BranchOutcome.js';
import type { KnownErrorDetection } from './KnownErrorDetection.js';
import type { TreeDescent } from './TreeDescent.js';

/** A node of the error tree, once investigated. */
export interface ErrorTreeNode {
  /** Unique in the tree. */
  readonly id: string;
  readonly parentId?: string;
  /** 0 = root. */
  readonly level: number;
  readonly target: string;
  readonly key: string;
  readonly errorKey: string;
  readonly occurrences?: number;
  readonly label: string;
  readonly occurredAt?: string;
  readonly correlation: Readonly<Record<string, string>>;
  /** Services traversed without errors between the parent and this node. */
  readonly via?: ReadonlyArray<string>;
  readonly descents: ReadonlyArray<TreeDescent>;
  /** `failed` when a step of the node failed: the chain stops there, with what the node collected. */
  readonly status: 'ok' | 'failed';
  readonly failure?: string;
  /** Known errors that recognize the node, in time order. */
  readonly detections: ReadonlyArray<KnownErrorDetection>;
  readonly branchOutcome: BranchOutcome;
  readonly incompleteEvidence?: boolean;
}
