import type { ScheduleAction } from '../types/ScheduleAction.js';
import { SCHEDULE_ACTIONS } from '../types/ScheduleAction.js';

/**
 * Narrows an arbitrary CLI value to a supported action.
 *
 * @param value - Raw string coming from the CLI
 * @returns True when the value is a supported action
 */
export function isScheduleAction(value: string): value is ScheduleAction {
  return (SCHEDULE_ACTIONS as ReadonlyArray<string>).includes(value);
}
