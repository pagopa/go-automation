/**
 * What the run does with a row, given its state from previous sessions.
 */
export type RowAction = 'send' | 'verify' | 'request-id' | 'skip';
