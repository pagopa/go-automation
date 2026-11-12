/**
 * What a session will do, from the validation summary.
 */

import type { Dispatch } from '@go-automation/go-send';

import type { PlannedWork } from '../types/PlannedWork.js';

/**
 * Rows the session works on, as confirmed by the user: the rows to send when
 * it sends something, otherwise the rows to process (verify or requestId
 * only, e.g. `--phases request-id` or a resume whose rows are all sent).
 *
 * @param summary - Validation summary
 * @param sendPhase - Whether `send` is among the phases
 * @returns The planned work
 */
export function plannedWork(summary: Dispatch.ValidationSummary, sendPhase: boolean): PlannedWork {
  const sending = sendPhase && summary.rowsToSend > 0;
  return { rows: sending ? summary.rowsToSend : summary.rowsToProcess, sending };
}
