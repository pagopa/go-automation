import type { AlarmOutput } from './AlarmOutput.js';
import { optionalString } from './outputValues.js';

/**
 * Builds the `alarm` block of the output details from the execution parameters, shared by
 * every output builder (API Gateway, Lambda, service, declared output).
 *
 * Each value is normalised by `optionalString`: blank values and the `-` placeholder are
 * omitted. `timeRange` is always present, empty when neither bound is available. Keys keep
 * the order `name`, `datetime`, `datetimeEnd`, `timeRange` (`start`, `end`), on which the
 * serialized output depends.
 *
 * @param params - Execution parameters (`alarmName`, `alarmDatetime`, `alarmDatetimeEnd`, `startTime`, `endTime`)
 * @returns The normalised alarm block
 *
 * @example
 * ```typescript
 * buildAlarmOutput(new Map([['alarmName', 'pn-foo'], ['startTime', '2026-11-15T10:00:00Z']]));
 * // { name: 'pn-foo', timeRange: { start: '2026-11-15T10:00:00Z' } }
 * ```
 */
export function buildAlarmOutput(params: ReadonlyMap<string, string>): AlarmOutput {
  return {
    ...optionalString('name', params.get('alarmName')),
    ...optionalString('datetime', params.get('alarmDatetime')),
    ...optionalString('datetimeEnd', params.get('alarmDatetimeEnd')),
    timeRange: {
      ...optionalString('start', params.get('startTime')),
      ...optionalString('end', params.get('endTime')),
    },
  };
}
