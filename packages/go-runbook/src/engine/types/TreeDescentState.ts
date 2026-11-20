/** How the read of a descent ended for its parent. */
export type TreeDescentState = 'queried' | 'saturated' | 'unavailable' | 'skipped' | 'cycle';
