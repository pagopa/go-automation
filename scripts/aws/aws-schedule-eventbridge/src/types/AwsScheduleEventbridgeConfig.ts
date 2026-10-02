import type { AWS } from '@go-automation/go-common';

import type { ScheduleAction } from './ScheduleAction.js';

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
