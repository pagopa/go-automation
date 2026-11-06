import { REFUSED_BY_TIMELINE, WORKFLOW_ENDED_PREFIX } from './requestIdReasons.js';
import type { RowAcceptance } from './RowAcceptance.js';
import type { RowState } from './RowState.js';

/**
 * SEND's acceptance of a row's notification, from explicit evidence only. Pure.
 *
 * - `REFUSED`: status `REFUSED` (verification), or the requestId phase saw the
 *   timeline end with `REQUEST_REFUSED`.
 * - `ACCEPTED`: the verification recorded the acceptance (`acceptedAt`, kept
 *   by the later requestId statuses); or the requestId phase found a
 *   `PREPARE_*` element, or saw the workflow end with any other category
 *   (delivery workflows, unreachable, cancellation): those exist only for an
 *   accepted notification.
 * - `UNKNOWN` otherwise, e.g. `SENT` without verification, or a requestId
 *   `TIMEOUT` when the acceptance was never verified.
 *
 * @param state - Row state from the ledger
 * @returns The acceptance of the row
 */
export function acceptanceOf(state: RowState): RowAcceptance {
  if (state.status === 'REFUSED' || state.requestIdReason === REFUSED_BY_TIMELINE) return 'REFUSED';
  if (state.acceptedAt !== undefined || state.status === 'ACCEPTED' || state.status === 'REQUEST_ID_FOUND') {
    return 'ACCEPTED';
  }
  if (state.status === 'REQUEST_ID_NOT_FOUND' && state.requestIdReason?.startsWith(WORKFLOW_ENDED_PREFIX) === true) {
    return 'ACCEPTED';
  }
  return 'UNKNOWN';
}
