import { acceptanceOf } from '../model/acceptanceOf.js';
import { IUN_UNKNOWN, WORKFLOW_ENDED_PREFIX } from '../model/requestIdReasons.js';
import type { RowState } from '../model/RowState.js';
import type { RowAction } from './RowAction.js';
import type { RowActionPolicy } from './RowActionPolicy.js';

/**
 * Decides what to do with a row on (re)start (§11.3). Pure.
 *
 * A requestId outcome (`REQUEST_ID_FOUND` / `REQUEST_ID_NOT_FOUND`) whose
 * acceptance is still unknown (`--phases request-id`, or selected categories
 * that precede the acceptance) is verified first when the verify phase is
 * on: the outcome says nothing about SEND accepting or refusing the
 * notification. The requestId rules apply only once the acceptance is known.
 *
 * @param state - State from the journal, `undefined` for a new row
 * @param policy - Active phases and retry flags
 * @returns The action
 */
export function decideRowAction(state: RowState | undefined, policy: RowActionPolicy): RowAction {
  const status = state?.status;
  switch (status) {
    case undefined:
    case 'PENDING':
    case 'SENDING':
    case 'RECONCILING':
      return 'send';
    case 'SEND_UNCERTAIN':
      return policy.retryUncertain ? 'send' : 'skip';
    case 'SEND_FAILED':
      return policy.retryFailed && state?.error?.retryable === true ? 'send' : 'skip';
    case 'SENT':
    case 'VERIFY_TIMEOUT':
      // A verification that timed out says nothing about the notification: like SENT,
      // verified again if verify is on, otherwise straight to the requestId phase.
      if (policy.verify) return 'verify';
      return policy.requestId ? 'request-id' : 'skip';
    case 'ACCEPTED':
      return policy.requestId ? 'request-id' : 'skip';
    case 'REQUEST_ID_FOUND':
    case 'REQUEST_ID_NOT_FOUND':
      // Acceptance never established: only the verification can tell accepted from refused.
      if (policy.verify && state !== undefined && acceptanceOf(state) === 'UNKNOWN') return 'verify';
      if (status === 'REQUEST_ID_FOUND') return 'skip';
      // The workflow ended without the wanted categories: querying again cannot find them.
      if (state?.requestIdReason?.startsWith(WORKFLOW_ENDED_PREFIX) === true) return 'skip';
      // Without the IUN the timeline cannot be read: only the verification can obtain it.
      if (state?.requestIdReason === IUN_UNKNOWN) return policy.verify ? 'verify' : 'skip';
      return policy.requestId ? 'request-id' : 'skip';
    case 'INVALID':
    case 'REFUSED':
      return 'skip';
    default: {
      const exhaustive: never = status;
      throw new Error(`Unhandled row status ${String(exhaustive)}`);
    }
  }
}
