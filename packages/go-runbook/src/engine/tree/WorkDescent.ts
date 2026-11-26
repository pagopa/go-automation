import type { ReadDescent } from '../reads/ReadDescent.js';
import type { DescendRequest } from '../types/DescendRequest.js';

/** A descent while the tree is investigated. */
export interface WorkDescent {
  readonly request: DescendRequest;
  readonly read: ReadDescent;
  readonly childIds: string[];
  rowCount: number;
  readonly through?: ReadonlySet<string>;
  readonly from?: WorkDescent;
}
