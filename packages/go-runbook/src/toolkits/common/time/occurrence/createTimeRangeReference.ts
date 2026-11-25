import { trimToUndefined } from '@pagopa/go-common/utils';

import type { TimeRangeReference } from './TimeRangeReference.js';

/**
 * Builds the time-range reference used by {@link computeTimeRange}.
 *
 * `alarmDatetimeEnd` is optional and may arrive as an empty string from
 * CLI/env/config loading. Empty or whitespace-only values are treated as
 * absent so they do not accidentally switch the run into multi-occurrence
 * mode and fail later during ISO parsing.
 */
export function createTimeRangeReference(alarmDatetime: string, alarmDatetimeEnd?: string): TimeRangeReference {
  const normalizedEnd = trimToUndefined(alarmDatetimeEnd);
  if (normalizedEnd === undefined) {
    return { kind: 'single', at: alarmDatetime };
  }

  return { kind: 'multi', first: alarmDatetime, last: normalizedEnd };
}
