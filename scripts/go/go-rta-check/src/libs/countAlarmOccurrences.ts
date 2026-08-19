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

/** The read surface of the Watchtower client used here. */
export type AlarmEventCounter = Pick<WatchtowerClient, 'countAlarmEvents'>;

/**
 * Counts, for each alarm, how many occurrences Watchtower recorded in the given
 * environments. Each count is a single request, run with bounded concurrency.
 *
 * A failing count never fails the selection: the alarm is returned without a
 * count so it stays selectable.
 *
 * Complexity: O(N) requests for N alarms, at most {@link COUNT_CONCURRENCY} in flight.
 *
 * @param client - Authenticated Watchtower client
 * @param alarms - Alarms to count
 * @param environmentIds - Environment filter; omitted = every environment
 * @returns One entry per alarm, in input order
 *
 * @example
 * ```typescript
 * const counted = await countAlarmOccurrences(client, alarms, ['e1']);
 * const firing = counted.filter((entry) => entry.count !== 0);
 * ```
 */
export async function countAlarmOccurrences(
  client: AlarmEventCounter,
  alarms: ReadonlyArray<AlarmDto>,
  environmentIds: ReadonlyArray<string> | undefined,
): Promise<ReadonlyArray<AlarmOccurrences>> {
  const counted: AlarmOccurrences[] = new Array<AlarmOccurrences>(alarms.length);
  const pool = new Core.GOConcurrencyPool(COUNT_CONCURRENCY);

  await pool.runEach(alarms, async (alarm, index) => {
    counted[index] = { alarm, ...(await safeCount(client, alarm.id, environmentIds)) };
  });

  return counted;
}

async function safeCount(
  client: AlarmEventCounter,
  alarmId: string,
  environmentIds: ReadonlyArray<string> | undefined,
): Promise<{ readonly count?: number }> {
  try {
    const count = await client.countAlarmEvents({
      alarmId,
      ...(environmentIds !== undefined && environmentIds.length > 0 ? { environmentId: [...environmentIds] } : {}),
    });
    return { count };
  } catch {
    return {};
  }
}
