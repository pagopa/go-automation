import type { InteropK8sAlarm } from '../types/InteropK8sAlarm.js';
import type { InteropK8sAlarmContext } from '../types/InteropK8sAlarmContext.js';
import { INTEROP_ENVIRONMENTS } from '../../../environment/INTEROP_ENVIRONMENTS.js';
import { interopAlarmEnvironment } from '../../../alarms/interopAlarmEnvironment.js';
import {
  buildInteropK8sApplicationLogGroup,
  INTEROP_K8S_APPLICATION_LOG_GROUP_TEMPLATE,
} from '../../../applicationLogs/helpers/buildInteropK8sApplicationLogGroup.js';
import { defaultInteropK8sRunbookStepIds } from './createInteropK8sAlarmRunbook.js';
import type { InteropK8sAlarmNameFn } from './InteropK8sAlarmNameFn.js';
import type { InteropK8sAlarmSpec } from './InteropK8sAlarmSpec.js';

/**
 * Default alarm naming: the runbook key followed by the environment.
 * `k8s-interop-be-…-errors-prod`.
 */
const defaultAlarmName: InteropK8sAlarmNameFn = (runbookKey, environment) => `${runbookKey}-${environment}`;

/**
 * Declares one INTEROP k8s alarm runbook.
 *
 * The five siblings differ only in the three identifiers below plus, for
 * `public-catalog`, the shape of the alarm name — everything else (alarm
 * name list, environment pattern, error message, step ids, context) follows
 * from them.
 *
 * @param spec - The identifiers that distinguish this runbook
 * @returns The alarm definition consumed by the runbook, its known errors and the registry
 *
 * @example
 * ```typescript
 * export const BFF = defineInteropK8sAlarm({
 *   runbookKey: 'k8s-interop-be-backend-for-frontend-errors',
 *   podApp: 'interop-be-backend-for-frontend',
 *   varPrefix: 'interopBff',
 * });
 * ```
 */
export function defineInteropK8sAlarm(spec: InteropK8sAlarmSpec): InteropK8sAlarm {
  const buildName = spec.alarmName ?? defaultAlarmName;
  const environments = spec.environments ?? INTEROP_ENVIRONMENTS;
  const alarms = environments.map((environment) => [buildName(spec.runbookKey, environment), environment] as const);
  const alarmNames = alarms.map(([name]) => name) as [string, ...string[]]; // Safe: environments is a non-empty tuple.
  const environmentOf = interopAlarmEnvironment(alarms);

  return {
    runbookKey: spec.runbookKey,
    podApp: spec.podApp,
    varPrefix: spec.varPrefix,
    logGroup: INTEROP_K8S_APPLICATION_LOG_GROUP_TEMPLATE,
    alarmNames,
    stepIds: defaultInteropK8sRunbookStepIds(spec.podApp),
    resolveContext(alarmName: string): InteropK8sAlarmContext {
      const environment = environmentOf(alarmName);
      return {
        alarmName,
        runbookKey: spec.runbookKey,
        environment,
        podApp: spec.podApp,
        logGroup: buildInteropK8sApplicationLogGroup(environment),
      };
    },
  };
}
