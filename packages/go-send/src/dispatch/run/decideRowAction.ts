import type { RowState } from '../model/RowState.js';
import type { RowAction } from './RowAction.js';

/**
 * Decides what to do with a row on (re)start (§11.3). Pure.
 *
 * @param state - State from the journal, `undefined` for a new row
 * @param retryFailed - `--retry-failed`
 * @param retryUncertain - reconcile `SEND_UNCERTAIN` rows
 * @param verify - `verify` among the phases
 * @returns The action
 */
export function decideRowAction(
  state: RowState | undefined,
  retryFailed: boolean,
  retryUncertain: boolean,
  verify: boolean,
): RowAction {
  const status = state?.status;
  switch (status) {
    case undefined:
    case 'PENDING':
    case 'UPLOADING':
    case 'SENDING':
    case 'RECONCILING':
      return 'send';
    case 'SEND_UNCERTAIN':
      return retryUncertain ? 'send' : 'skip';
    case 'SEND_FAILED':
      return retryFailed && state?.error?.retryable === true ? 'send' : 'skip';
    case 'SENT':
    case 'VERIFYING':
    case 'VERIFY_TIMEOUT':
      return verify ? 'verify' : 'skip';
    case 'INVALID':
    case 'DRY_RUN':
    case 'ACCEPTED':
    case 'REFUSED':
    case 'DONE':
      return 'skip';
    default: {
      const exhaustive: never = status;
      throw new Error(`Unhandled row status ${String(exhaustive)}`);
    }
  }
}
