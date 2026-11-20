import type { RunbookOutput } from '@pagopa/go-runbook/output';

import type { OccurrenceEvidenceWindow } from './OccurrenceEvidenceWindow.js';

/**
 * The evidence window the runbook read for the occurrence: its `startTime` and `endTime` inputs. Human tracking is
 * compared within it, so a runbook that looks 30 minutes back (SelfcarePG) keeps a tracking entry 20 minutes before
 * the alarm, and one with a short window does not borrow an entry from minutes later.
 *
 * @param output - The runbook output of the occurrence
 * @returns The window, or `undefined` when the inputs do not carry valid bounds
 */
export function resolveOccurrenceEvidenceWindow(output: RunbookOutput): OccurrenceEvidenceWindow | undefined {
  const start = Date.parse(output.input['startTime'] ?? '');
  const end = Date.parse(output.input['endTime'] ?? '');
  return Number.isNaN(start) || Number.isNaN(end) || end < start ? undefined : { start, end };
}
