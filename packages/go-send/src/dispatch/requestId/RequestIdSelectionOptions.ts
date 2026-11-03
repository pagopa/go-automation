import type { RequestIdSelect } from './RequestIdSelect.js';
import type { RequestIdWait } from './RequestIdWait.js';

/**
 * Rule of `selectRequestIds` (§8.3).
 */
export interface RequestIdSelectionOptions {
  /** Categories searched, in priority order (default analog, then digital). */
  readonly categories: ReadonlyArray<string>;
  readonly select: RequestIdSelect;
  readonly wait: RequestIdWait;
  /** Categories that end the workflow: no further `PREPARE_*` will appear. */
  readonly endCategories: ReadonlyArray<string>;
}
