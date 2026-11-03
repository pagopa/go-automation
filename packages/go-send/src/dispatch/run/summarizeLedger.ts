import type { RowState } from '../model/RowState.js';
import type { FailureGroup } from './FailureGroup.js';
import type { SendStatistics } from './SendStatistics.js';

/**
 * Groups the rows with an error by error code, largest groups first. Pure.
 *
 * @param states - Row states
 * @param sample - Row keys kept per group
 * @returns One group per error code
 */
export function groupFailures(states: Iterable<RowState>, sample: number): ReadonlyArray<FailureGroup> {
  const groups = new Map<string, { count: number; rowKeys: string[]; message: string }>();
  for (const state of states) {
    if (state.error === undefined) continue;
    const group = groups.get(state.error.code) ?? { count: 0, rowKeys: [], message: state.error.message };
    group.count += 1;
    if (group.rowKeys.length < sample) group.rowKeys.push(state.rowKey);
    groups.set(state.error.code, group);
  }
  return [...groups.entries()]
    .map(([code, group]) => ({ code, ...group }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

/**
 * Timing of the send phase from the `sentAt` of the rows. Pure.
 *
 * @param states - Row states
 * @returns Number of sent rows, first/last send and average rate
 */
export function sendStatistics(states: Iterable<RowState>): SendStatistics {
  let sent = 0;
  let first: string | undefined;
  let last: string | undefined;
  for (const state of states) {
    if (state.sentAt === undefined) continue;
    sent += 1;
    if (first === undefined || state.sentAt < first) first = state.sentAt;
    if (last === undefined || state.sentAt > last) last = state.sentAt;
  }
  if (first === undefined || last === undefined) return { sent };
  const seconds = (Date.parse(last) - Date.parse(first)) / 1000;
  return {
    sent,
    firstSentAt: first,
    lastSentAt: last,
    ...(seconds > 0 && { averageRate: (sent - 1) / seconds }),
  };
}
