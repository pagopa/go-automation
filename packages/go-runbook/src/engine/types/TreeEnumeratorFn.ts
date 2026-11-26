import type { TreeEnumerated } from './TreeEnumerated.js';
import type { TreeEnumeration } from './TreeEnumeration.js';

/** Divides the rows a level read into error nodes. */
export type TreeEnumeratorFn = (enumeration: TreeEnumeration) => TreeEnumerated;
