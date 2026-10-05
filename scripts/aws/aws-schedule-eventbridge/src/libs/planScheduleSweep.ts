/**
 * Phase 2 of the sweep: turns what was read into what will be written.
 *
 * Pure by design. Everything that decides whether production is mutated lives
 * here, so it is testable without a single test double.
 */

import type { AWS } from '@go-automation/go-common';

import type { ScheduleRead, ScheduleSweepAction, ScheduleSweepEntry, ScheduleSweepPlan } from '../types/index.js';

/** Decides the action for one account, given where it is and where it must go. */
function classifyRead(read: ScheduleRead, targetState: AWS.ScheduleState): ScheduleSweepAction {
  switch (read.status) {
    case 'error':
      return 'error';
    case 'not-found':
      return 'missing';
    default:
      // `found`: the schedule is there, so it either already matches or moves.
      return read.schedule?.State === targetState ? 'no-op' : 'update';
  }
}

/**
 * Classifies every read against the requested state.
 *
 * `changeNeeded` is computed once here and consumed by both the confirmation
 * gate and the write phase, so the two can never disagree on the blast radius.
 *
 * @param reads - One read per configured profile, in configuration order
 * @param targetState - State every account must end up in
 * @returns The plan, preserving the order of `reads`
 */
export function planScheduleSweep(
  reads: ReadonlyArray<ScheduleRead>,
  targetState: AWS.ScheduleState,
): ScheduleSweepPlan {
  const entries: ReadonlyArray<ScheduleSweepEntry> = reads.map((read) => ({
    ...read,
    action: classifyRead(read, targetState),
  }));

  return {
    targetState,
    entries,
    changeNeeded: entries.filter((entry) => entry.action === 'update'),
    profileCount: entries.length,
  };
}
