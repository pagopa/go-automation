import type { AWS } from '@go-automation/go-common';

import type { ScheduleReadStatus } from './ScheduleReadStatus.js';

/**
 * The target schedule as read from a single AWS profile.
 *
 * Every field is required and nullable rather than optional: these objects are
 * built in a loop, and with `exactOptionalPropertyTypes` an optional property
 * would force a conditional spread at each construction site.
 */
export interface ScheduleRead {
  /** Profile the read was issued against */
  readonly profile: string;

  /** Account owning the profile credentials, undefined when STS did not answer */
  readonly accountId: string | undefined;

  /** The schedule, present only when `status` is `found` */
  readonly schedule: AWS.GetScheduleCommandOutput | undefined;

  /** How the read ended */
  readonly status: ScheduleReadStatus;

  /** Failure cause, present only when `status` is `error` */
  readonly error: Error | undefined;
}
