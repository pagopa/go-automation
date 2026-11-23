import type { RunbookContext } from './RunbookContext.js';
import type { StepKind } from './StepKind.js';
import type { TreeLevelReadResult } from './TreeLevelReadResult.js';
import type { EvidenceIdentifier } from './EvidenceIdentifier.js';
import type { TreeLevelRowRules } from './TreeLevelRowRules.js';

/**
 * The grouped read of a level: one read for a batch of identifiers of the same kind, combined in `OR`. It is not a
 * step: the engine calls `read`; id, label and kind name the read in the trace, the services it declares are checked
 * with those of the steps before the first step runs, and `getTraceInfo` describes the read with a sample query.
 */
export interface TreeLevelReader {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind;
  read(
    context: RunbookContext,
    identifiers: ReadonlyArray<EvidenceIdentifier>,
    rules?: TreeLevelRowRules,
  ): Promise<TreeLevelReadResult>;
  /**
   * Divides the identifiers of a level into the batches to read, at most `maxIdentifiers` each when given; without it
   * the engine reads fixed batches.
   */
  batches?(
    identifiers: ReadonlyArray<EvidenceIdentifier>,
    maxIdentifiers?: number,
  ): ReadonlyArray<ReadonlyArray<EvidenceIdentifier>>;
  getTraceInfo?(context: RunbookContext): Readonly<Record<string, unknown>>;
  requiredServices?(): ReadonlyArray<string>;
}
