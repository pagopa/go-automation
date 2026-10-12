import type { AWS } from '@go-automation/go-common';

import type { ScheduleMutationOutcome } from './ScheduleMutationOutcome.js';

/**
 * Result of the write phase for a single profile.
 *
 * There is exactly one of these per configured profile, including the ones the
 * plan skipped: the report must state `sso_prod — NO-OP` positively rather than
 * leave the operator to infer it from an absent row.
 */
export interface ScheduleMutation {
  /** Profile the write was issued against */
  readonly profile: string;

  /** How the write ended */
  readonly outcome: ScheduleMutationOutcome;

  /** State the schedule had before the write */
  readonly previousState: AWS.ScheduleState | undefined;

  /** State the schedule has after the write */
  readonly currentState: AWS.ScheduleState | undefined;

  /** ARN of the schedule that was written */
  readonly scheduleArn: string | undefined;

  /** Failure cause, present only when `outcome` is `failed` */
  readonly error: Error | undefined;
}
