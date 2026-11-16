import type { OccurrenceTimeWindow } from './OccurrenceTimeWindow.js';

/** Default symmetric time-window padding retained for compatibility. */
export const DEFAULT_TIME_WINDOW_MINUTES = 5;

/** Default diagnostic window used by runbooks that do not override it. */
export const DEFAULT_OCCURRENCE_TIME_WINDOW: OccurrenceTimeWindow = {
  beforeMinutes: DEFAULT_TIME_WINDOW_MINUTES,
  afterMinutes: DEFAULT_TIME_WINDOW_MINUTES,
};
