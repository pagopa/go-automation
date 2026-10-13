/**
 * Actions supported by the script.
 *
 * `list` and `describe` are read-only; `enable` and `disable` mutate a single
 * schedule and go through an interactive confirmation.
 */
export const SCHEDULE_ACTIONS = ['list', 'describe', 'enable', 'disable'] as const;

/** One of the supported script actions */
export type ScheduleAction = (typeof SCHEDULE_ACTIONS)[number];
