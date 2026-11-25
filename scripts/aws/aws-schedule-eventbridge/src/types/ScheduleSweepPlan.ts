import type { ScheduleState } from '@pagopa/go-aws/scheduler';

import type { ScheduleSweepEntry } from './ScheduleSweepEntry.js';

/**
 * What the sweep will do to the fleet, decided before anything is written.
 */
export interface ScheduleSweepPlan {
  /** State every account must end up in */
  readonly targetState: ScheduleState;

  /** One entry per configured profile, in configuration order */
  readonly entries: ReadonlyArray<ScheduleSweepEntry>;

  /** The subset of `entries` whose action is `update` */
  readonly changeNeeded: ReadonlyArray<ScheduleSweepEntry>;

  /** Number of profiles swept, i.e. `entries.length` */
  readonly profileCount: number;
}
