import type { AWS } from '@go-automation/go-common';

/** Schedule states accepted by the `--state` filter */
export const SCHEDULE_STATES = ['ENABLED', 'DISABLED'] as const;

/**
 * Narrows an arbitrary CLI value to a schedule state accepted by the API.
 *
 * @param value - Raw string coming from the CLI
 * @returns True when the value is a valid schedule state
 */
export function isScheduleState(value: string): value is AWS.ScheduleState {
  return (SCHEDULE_STATES as ReadonlyArray<string>).includes(value);
}
