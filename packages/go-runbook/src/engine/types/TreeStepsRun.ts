import type { DescendRequest } from './DescendRequest.js';
import type { RunbookContext } from './RunbookContext.js';

/** What running the steps of an error node produced. */
export interface TreeStepsRun {
  /** Context after the steps, with the evidence of repeated visits. */
  readonly context: RunbookContext;
  /** Error of the step that failed. */
  readonly failure?: string;
  readonly descends: ReadonlyArray<DescendRequest>;
  readonly incompleteEvidence?: boolean;
}
