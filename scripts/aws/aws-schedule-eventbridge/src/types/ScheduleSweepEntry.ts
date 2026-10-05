import type { ScheduleRead } from './ScheduleRead.js';
import type { ScheduleSweepAction } from './ScheduleSweepAction.js';

/**
 * A read plus the action planned for it.
 *
 * Deliberately flat rather than nesting the read: the preview table is built
 * straight off `entry.profile` / `entry.action`.
 */
export interface ScheduleSweepEntry extends ScheduleRead {
  /** Action planned for this account */
  readonly action: ScheduleSweepAction;
}
