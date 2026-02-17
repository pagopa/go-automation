import type { RunbookContext } from '../../types/RunbookContext.js';
import type { TimeRange } from '../../types/TimeRange.js';
import type { TimeRangeFromParams } from './CloudWatchLogsQueryStep.js';

/**
 * Resolves a TimeRange from context parameters using the configured parameter names.
 * Validates that both parameters exist and are valid ISO 8601 dates,
 * and that the start date is strictly before the end date.
 *
 * @param context - The runbook execution context
 * @param config - Configuration mapping parameter names to start/end
 * @returns Resolved TimeRange with parsed Date objects
 */
export function resolveTimeRange(context: RunbookContext, config: TimeRangeFromParams): TimeRange {
  const startStr = context.params.get(config.start);
  const endStr = context.params.get(config.end);

  if (startStr === undefined) {
    throw new Error(`Missing required parameter '${config.start}' for time range start`);
  }
  if (endStr === undefined) {
    throw new Error(`Missing required parameter '${config.end}' for time range end`);
  }

  const start = new Date(startStr);
  const end = new Date(endStr);

  if (Number.isNaN(start.getTime())) {
    throw new Error(`Invalid ISO date for parameter '${config.start}': ${startStr}`);
  }
  if (Number.isNaN(end.getTime())) {
    throw new Error(`Invalid ISO date for parameter '${config.end}': ${endStr}`);
  }

  if (start >= end) {
    throw new Error(`Invalid time range: start (${startStr}) must be before end (${endStr})`);
  }

  return { start, end };
}
