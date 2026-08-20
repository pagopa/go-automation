/**
 * Occurrence counting used to rank the runbooks offered for an environment.
 */
import { Core } from '@go-automation/go-common';
import type { AlarmDto, WatchtowerClient } from '@go-automation/go-watchtower-client';

/** How many alarm-event counts are requested at the same time. */
const COUNT_CONCURRENCY = 6;

/** An alarm with the number of occurrences recorded in the selected environments. */
export interface AlarmOccurrences {
  readonly alarm: AlarmDto;
  /** Occurrences in the selected environments; `undefined` when the count failed. */
  readonly count?: number;
}

/** Counting outcome: the entries, plus what went wrong while producing them. */
export interface AlarmOccurrencesReport {
  /** One entry per alarm, in input order. */
  readonly entries: ReadonlyArray<AlarmOccurrences>;
  /** How many counts could not be read. */
  readonly failed: number;
  /** Message of the first failure, so the missing counts can be explained. */
  readonly firstError?: string;
}

/** The read surface of the Watchtower client used here. */
export type AlarmEventCounter = Pick<WatchtowerClient, 'countAlarmEvents'>;

/**
 * Counts, for each alarm, how many occurrences Watchtower recorded in the given
 * environments. Each count is a single request, run with bounded concurrency.
 *
 * A failing count never fails the selection: the alarm is returned without a
 * count so it stays selectable, but the failure is reported so a broken
 * Watchtower does not look like a catalogue of idle runbooks.
 *
 * Complexity: O(N) requests for N alarms, at most {@link COUNT_CONCURRENCY} in flight.
 *
 * @param client - Authenticated Watchtower client
 * @param alarms - Alarms to count
 * @param environmentIds - Environment filter; omitted = every environment
 * @returns The entries in input order, with the number of failed counts
 *
 * @example
 * ```typescript
 * const { entries, failed } = await countAlarmOccurrences(client, alarms, ['e1']);
 * const firing = entries.filter((entry) => entry.count !== 0);
 * ```
 */
export async function countAlarmOccurrences(
  client: AlarmEventCounter,
  alarms: ReadonlyArray<AlarmDto>,
  environmentIds: ReadonlyArray<string> | undefined,
): Promise<AlarmOccurrencesReport> {
  const entries: AlarmOccurrences[] = new Array<AlarmOccurrences>(alarms.length);
  const errors: string[] = [];
  const pool = new Core.GOConcurrencyPool(COUNT_CONCURRENCY);

  await pool.runEach(alarms, async (alarm, index) => {
    const outcome = await safeCount(client, alarm.id, environmentIds);
    entries[index] = { alarm, ...(outcome.count !== undefined ? { count: outcome.count } : {}) };
    if (outcome.error !== undefined) errors.push(outcome.error);
  });

  const firstError = errors[0];
  return {
    entries,
    failed: errors.length,
    ...(firstError !== undefined ? { firstError } : {}),
  };
}

interface CountOutcome {
  readonly count?: number;
  readonly error?: string;
}

async function safeCount(
  client: AlarmEventCounter,
  alarmId: string,
  environmentIds: ReadonlyArray<string> | undefined,
): Promise<CountOutcome> {
  try {
    const count = await client.countAlarmEvents({
      alarmId,
      ...(environmentIds !== undefined && environmentIds.length > 0 ? { environmentId: [...environmentIds] } : {}),
    });
    return { count };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
