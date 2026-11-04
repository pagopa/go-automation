/**
 * Outcome counts shared by the progress line and the final summary.
 */

import type { Dispatch } from '@go-automation/go-send';

import type { OutcomeCounts } from '../types/OutcomeCounts.js';

/** Statuses of a row whose notification was sent (or imported as sent). */
const SENT_STATUSES: ReadonlyArray<Dispatch.RowStatus> = [
  'SENT',
  'ACCEPTED',
  'REFUSED',
  'VERIFY_TIMEOUT',
  'REQUEST_ID_FOUND',
  'REQUEST_ID_NOT_FOUND',
];

/**
 * Derives sent, accepted, refused and failed rows from a progress snapshot.
 *
 * Acceptance comes from the evidence counted by the session (`byAcceptance`),
 * not from the status: `REQUEST_ID_NOT_FOUND` may follow a timeline that
 * ended with `REQUEST_REFUSED`, and with `--phases request-id` a
 * `REQUEST_ID_*` row was never verified.
 *
 * @param progress - Snapshot from `DispatchSession.progress()`
 * @returns The outcome counts
 *
 * @example
 * ```typescript
 * const { sent, accepted } = countOutcomes(session.progress());
 * ```
 */
export function countOutcomes(progress: Dispatch.DispatchProgress): OutcomeCounts {
  const count = (status: Dispatch.RowStatus): number => progress.byStatus.get(status) ?? 0;
  return {
    accepted: progress.byAcceptance.get('ACCEPTED') ?? 0,
    refused: progress.byAcceptance.get('REFUSED') ?? 0,
    sent: SENT_STATUSES.reduce((total, status) => total + count(status), 0),
    errors: count('SEND_FAILED') + count('SEND_UNCERTAIN'),
  };
}
