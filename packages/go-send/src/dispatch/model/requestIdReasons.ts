/**
 * Values of `requestIdReason` (`RowState`, `JournalEntry`) that more than one
 * module reads: written by the requestId stage, read by the resume decision.
 */

/** Prefix of a timeline that reached an end-of-workflow category: `WORKFLOW_ENDED:<category>`. */
export const WORKFLOW_ENDED_PREFIX = 'WORKFLOW_ENDED:';

/** The IUN of the row is unknown, so its timeline cannot be read (also the error code). */
export const IUN_UNKNOWN = 'IUN_UNKNOWN';
