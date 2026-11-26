import type { RunbookReads } from '../types/RunbookReads.js';

/** The reads of a context without gaps: every read is `queried`. */
export const EMPTY_RUNBOOK_READS: RunbookReads = {
  stateOf: () => 'queried',
  isComplete: () => true,
  hasGapFor: () => false,
};
