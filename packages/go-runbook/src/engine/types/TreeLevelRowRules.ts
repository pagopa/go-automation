import type { TreeRowAttributionFn } from './TreeRowAttributionFn.js';
import type { TreeRowIdentityFn } from './TreeRowIdentityFn.js';

/** The rules of the rows of a level that a reader may use: which identifier a row belongs to, and its identity. */
export interface TreeLevelRowRules {
  readonly attribute?: TreeRowAttributionFn;
  readonly rowIdentity?: TreeRowIdentityFn;
}
