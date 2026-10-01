import type { AWS } from '@go-automation/go-common';

/**
 * Actions supported by the script.
 *
 * `list` and `describe` are read-only; `enable` and `disable` mutate a single
 * schedule and go through an interactive confirmation.
 */
export const SCHEDULE_ACTIONS = ['list', 'describe', 'enable', 'disable'] as const;

/** One of the supported script actions */
export type ScheduleAction = (typeof SCHEDULE_ACTIONS)[number];

/**
 * Narrows an arbitrary CLI value to a supported action.
 *
 * @param value - Raw string coming from the CLI
 * @returns True when the value is a supported action
 */
export function isScheduleAction(value: string): value is ScheduleAction {
  return (SCHEDULE_ACTIONS as ReadonlyArray<string>).includes(value);
}

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

/**
 * Script configuration interface.
 * Represents all validated configuration parameters.
 */
export interface AwsScheduleEventbridgeConfig {
  /** AWS profile name for SSO authentication */
  readonly awsProfile: string;

  /** AWS region hosting the schedules */
  readonly awsRegion: string;

  /** Action to perform */
  readonly action: ScheduleAction;

  /** Name of the schedule to target (required for describe/enable/disable) */
  readonly scheduleName?: string;

  /** Schedule group owning the schedule */
  readonly scheduleGroup: string;

  /** Name prefix filter, applied by the `list` action only */
  readonly namePrefix?: string;

  /** State filter, applied by the `list` action only */
  readonly state?: AWS.ScheduleState;

  /** Skip the interactive confirmation before a mutation */
  readonly yes: boolean;
}
