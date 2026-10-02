/**
 * Table rendering for the sweep: the preview before the writes, and the per
 * account outcome after them.
 *
 * Kept apart from `scheduleDisplay.ts`, which renders single schedules, so
 * neither file grows into a grab bag.
 */

import type { Core } from '@go-automation/go-common';

import type { ScheduleMutation, ScheduleSweepPlan } from '../types/index.js';

/** Columns of the preview table */
const PLAN_COLUMNS: ReadonlyArray<Core.GOTableColumn> = [
  { header: 'Profile', key: 'profile', width: 24 },
  { header: 'Account', key: 'accountId', width: 14 },
  { header: 'Current State', key: 'currentState', width: 14 },
  { header: 'Target State', key: 'targetState', width: 14 },
  { header: 'Action', key: 'action', width: 10 },
  { header: 'Detail', key: 'detail', width: 44 },
];

/** Columns of the result table */
const RESULT_COLUMNS: ReadonlyArray<Core.GOTableColumn> = [
  { header: 'Profile', key: 'profile', width: 24 },
  { header: 'Outcome', key: 'outcome', width: 12 },
  { header: 'From', key: 'previousState', width: 12 },
  { header: 'To', key: 'currentState', width: 12 },
  { header: 'Detail', key: 'detail', width: 54 },
];

/**
 * Prints what the sweep is about to do to each account.
 *
 * The preview is advisory, and says so. `setScheduleState` re-reads the
 * schedule before writing it, which narrows the window the preview opens but
 * does not close it: `GetSchedule` and `UpdateSchedule` are separate calls, and
 * Scheduler offers no conditional write, so a configuration change landing
 * between the two is still overwritten by the snapshot just read. Only a state
 * change that reaches the target before the re-read is caught, and it surfaces
 * as `unchanged`.
 *
 * @param script - The GOScript instance providing the logger
 * @param plan - The plan produced by `planScheduleSweep`
 */
export function displaySweepPlan(script: Core.GOScript, plan: ScheduleSweepPlan): void {
  const data = plan.entries.map((entry) => ({
    profile: entry.profile,
    accountId: entry.accountId ?? '-',
    currentState: entry.schedule?.State ?? '-',
    targetState: entry.action === 'update' ? plan.targetState : '-',
    action: entry.action.toUpperCase(),
    detail: entry.error?.message ?? (entry.action === 'missing' ? 'schedule not present in this account' : '-'),
  }));

  script.logger.section(`Planned sweep to ${plan.targetState}`);
  script.logger.table({ columns: [...PLAN_COLUMNS], data });
  script.logger.info(
    'States above are a preview: each write re-reads its schedule first, so an account already ' +
      'moved to the target state is reported as UNCHANGED. A configuration change made during ' +
      'the write itself is still overwritten.',
  );
}

/**
 * Prints the outcome of the write phase, one row per configured account.
 *
 * @param script - The GOScript instance providing the logger
 * @param mutations - Write outcomes produced by `applyScheduleSweep`
 */
export function displaySweepResult(script: Core.GOScript, mutations: ReadonlyArray<ScheduleMutation>): void {
  const data = mutations.map((mutation) => ({
    profile: mutation.profile,
    outcome: mutation.outcome.toUpperCase(),
    previousState: mutation.previousState ?? '-',
    currentState: mutation.currentState ?? '-',
    detail: mutation.error?.message ?? mutation.scheduleArn ?? '-',
  }));

  script.logger.section('Sweep result');
  script.logger.table({ columns: [...RESULT_COLUMNS], data });
}
