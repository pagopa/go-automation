import type { Gap } from './Gap.js';

/** A physical read of a level: failed as a whole, or with its gaps. */
export interface BatchRecord {
  readonly failed: boolean;
  readonly gaps: ReadonlyArray<Gap>;
}
