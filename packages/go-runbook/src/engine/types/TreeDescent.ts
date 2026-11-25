import type { DescendRequest } from './DescendRequest.js';
import type { ReadState } from './ReadState.js';

/** One descent of a node, once read. */
export interface TreeDescent extends DescendRequest {
  readonly state: ReadState;
  /** Error nodes found below; empty for a complete empty read, a failed or a skipped one. */
  readonly childIds: ReadonlyArray<string>;
  /** Rows read for the parent, in all attempts. */
  readonly rowCount: number;
  readonly incompleteVia?: boolean;
}
