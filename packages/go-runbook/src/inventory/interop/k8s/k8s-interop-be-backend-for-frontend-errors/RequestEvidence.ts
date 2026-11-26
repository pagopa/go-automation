import type { InteropLogRow } from '../../../../toolkits/interop/index.js';

export interface RequestEvidence {
  readonly cid: string;
  readonly logs: ReadonlyArray<InteropLogRow>;
  /** The rows of the sequence that proves the case: they give the request its time. */
  readonly supportingRows: ReadonlyArray<InteropLogRow>;
}
