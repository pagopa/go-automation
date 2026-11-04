/**
 * Outcome counts shared by the progress line and the final summary.
 */

import type { Dispatch } from '@go-automation/go-send';

import type { OutcomeCounts } from '../types/OutcomeCounts.js';

/**
 * Derives accepted, sent and failed rows from the status counts.
 *
 * @param byStatus - Rows by status (from `DispatchSession.progress()`)
 * @returns The outcome counts
 *
 * @example
 * ```typescript
 * const { sent, accepted } = countOutcomes(session.progress().byStatus);
 * ```
 */
export function countOutcomes(byStatus: ReadonlyMap<Dispatch.RowStatus, number>): OutcomeCounts {
  const count = (status: Dispatch.RowStatus): number => byStatus.get(status) ?? 0;
  const accepted = count('ACCEPTED') + count('REQUEST_ID_FOUND') + count('REQUEST_ID_NOT_FOUND');
  return {
    accepted,
    sent: count('SENT') + accepted + count('REFUSED') + count('VERIFY_TIMEOUT'),
    errors: count('SEND_FAILED') + count('SEND_UNCERTAIN'),
  };
}
