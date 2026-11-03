import type { RowState } from '../model/RowState.js';
import type { RowAction } from './RowAction.js';
import type { RowActionPolicy } from './RowActionPolicy.js';

/**
 * Decides what to do with a row on (re)start (§11.3). Pure.
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
    case 'UPLOADING':
    case 'SENDING':
    case 'RECONCILING':
      return 'send';
    case 'SEND_UNCERTAIN':
      return policy.retryUncertain ? 'send' : 'skip';
    case 'SEND_FAILED':
      return policy.retryFailed && state?.error?.retryable === true ? 'send' : 'skip';
    case 'SENT':
    case 'VERIFYING':
      if (policy.verify) return 'verify';
      return policy.requestId ? 'request-id' : 'skip';
    case 'VERIFY_TIMEOUT':
      return policy.verify ? 'verify' : 'skip';
    case 'ACCEPTED':
    case 'REQUEST_ID_NOT_FOUND':
      return policy.requestId ? 'request-id' : 'skip';
    case 'INVALID':
    case 'DRY_RUN':
    case 'REFUSED':
    case 'REQUEST_ID_FOUND':
    case 'DONE':
      return 'skip';
    default: {
      const exhaustive: never = status;
      throw new Error(`Unhandled row status ${String(exhaustive)}`);
    }
  }
}
