import type { RowAcceptance } from './RowAcceptance.js';
import type { RowState } from './RowState.js';

/**
 * SEND's acceptance of a row's notification, from explicit evidence only. Pure.
 *
 * - `REFUSED`: status `REFUSED` (verification), or the requestId phase read
 *   `REQUEST_REFUSED` in the timeline (`timelineAcceptance`).
 * - `ACCEPTED`: the verification recorded the acceptance (`acceptedAt`, kept
 *   by the later requestId statuses), or the requestId phase read in the
 *   timeline a category SEND writes only after accepting
 *   ({@link acceptanceFromTimeline}).
 * - `UNKNOWN` otherwise, e.g. `SENT` without verification, or a requestId
 *   `TIMEOUT` on a timeline still without acceptance.
 *
 * Neither `REQUEST_ID_FOUND` nor a `WORKFLOW_ENDED:<category>` reason is
 * evidence: both come from the categories the run selects, which may include
 * categories that precede the acceptance or `REQUEST_REFUSED` itself.
 *
 * @param state - Row state from the ledger
 * @returns The acceptance of the row
 */
export function acceptanceOf(state: RowState): RowAcceptance {
  if (state.status === 'REFUSED' || state.timelineAcceptance === 'REFUSED') return 'REFUSED';
  if (state.acceptedAt !== undefined || state.status === 'ACCEPTED' || state.timelineAcceptance === 'ACCEPTED') {
    return 'ACCEPTED';
  }
  return 'UNKNOWN';
}
