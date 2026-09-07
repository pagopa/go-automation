import type { OccurrenceTimeWindow } from '../types/OccurrenceTimeWindow.js';
import type { Runbook } from '../types/Runbook.js';

import { computeTimeRange } from './computeTimeRange.js';
import type { TimeRangeReference } from './TimeRangeReference.js';
import { DEFAULT_OCCURRENCE_TIME_WINDOW } from './runbooks/constants.js';

/** Resolves a runbook's explicit occurrence window or the catalog default. */
export function resolveOccurrenceTimeWindow(runbook: Pick<Runbook, 'occurrenceTimeWindow'>): OccurrenceTimeWindow {
  return runbook.occurrenceTimeWindow ?? DEFAULT_OCCURRENCE_TIME_WINDOW;
}

/** Computes the diagnostic range using the window declared by the runbook. */
export function computeRunbookTimeRange(
  runbook: Pick<Runbook, 'occurrenceTimeWindow'>,
  reference: TimeRangeReference,
): { startTime: string; endTime: string } {
  return computeTimeRange(reference, resolveOccurrenceTimeWindow(runbook));
}
