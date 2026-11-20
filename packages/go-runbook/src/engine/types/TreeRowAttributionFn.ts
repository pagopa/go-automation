import type { TreeReadIdentifier } from './TreeReadIdentifier.js';

/** Whether a row of a grouped read belongs to the given identifier. */
export type TreeRowAttributionFn = (row: unknown, identifier: TreeReadIdentifier) => boolean;
