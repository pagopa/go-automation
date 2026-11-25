import type { InteropEnvironment } from '../environment/InteropEnvironment.js';
import type { InteropAlarmEnvironmentFn } from './InteropAlarmEnvironmentFn.js';

/**
 * The index from alarm name to environment of an INTEROP runbook. A fired alarm resolves to its environment by exact
 * name, so a name the list does not contain is rejected even when it looks like a sibling.
 *
 * @param alarms - Every alarm of the runbook, with its environment
 * @returns The environment of an alarm name
 *
 * @example
 * ```typescript
 * const environmentOf = interopAlarmEnvironment([['interop-x-prod', 'prod']]);
 * environmentOf('interop-x-prod'); // 'prod'
 * ```
 */
export function interopAlarmEnvironment(
  alarms: ReadonlyArray<readonly [string, InteropEnvironment]>,
): InteropAlarmEnvironmentFn {
  const environmentByAlarmName = new Map(alarms);
  return (alarmName) => {
    const environment = environmentByAlarmName.get(alarmName);
    if (environment === undefined) {
      // Sorted like the registry and catalog descriptors expose alarmNames.
      const expected = alarms
        .map(([name]) => name)
        .sort()
        .join(', ');
      throw new Error(`Unsupported INTEROP alarm name "${alarmName}". Expected one of: ${expected}`);
    }
    return environment;
  };
}
