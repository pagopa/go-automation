import type { InteropEnvironment } from '../../../environment/InteropEnvironment.js';
import { INTEROP_ENVIRONMENTS } from '../../../environment/INTEROP_ENVIRONMENTS.js';
import {
  buildInteropK8sApplicationLogGroup,
  INTEROP_K8S_APPLICATION_LOG_GROUP_TEMPLATE,
} from '../../../applicationLogs/helpers/buildInteropK8sApplicationLogGroup.js';
import {
  buildInteropApiGwAccessLogGroup,
  INTEROP_API_GW_ACCESS_LOG_GROUP_TEMPLATE,
} from '../helpers/buildInteropApiGwAccessLogGroup.js';
import type { InteropApiGwAlarm } from '../types/InteropApiGwAlarm.js';
import type { InteropApiGwAlarmContext } from '../types/InteropApiGwAlarmContext.js';
import type { InteropApiGwAlarmSpec } from '../types/InteropApiGwAlarmSpec.js';
import { defaultInteropApiGwRunbookStepIds } from './createInteropApiGwAlarmRunbook.js';

/**
 * Declares one INTEROP API Gateway alarm runbook (EVO-RBREORG-OPUS-01 P30): the
 * API Gateway counterpart of `defineInteropK8sAlarm`. Replaces the per-runbook
 * copies of the alarm list and of `resolveContext`.
 *
 * The alarm list is one name per environment, in the order of
 * {@link INTEROP_ENVIRONMENTS}, followed by the additional alarms. A fired alarm
 * resolves to its environment by exact name, so a name the list does not
 * contain is rejected even when it looks like a sibling.
 *
 * @param spec - The identifiers that distinguish this runbook
 * @returns The alarm definition consumed by the runbook, its known cases and the registry
 *
 * @example
 * ```typescript
 * export const ALARM = interop.apigw.defineInteropApiGwAlarm({
 *   runbookKey: 'interop-api-v2-apigw-5xx',
 *   serviceName: 'interop-be-m2m-gateway',
 *   varPrefix: 'interopM2mGateway',
 *   apiGwProfileId: 'interop-api-gateway-m2m-v2-5xx',
 *   apiGwIds: { prod: 'a', att: 'b', test: 'c' },
 *   alarmName: (environment) => `interop-api-v2-${environment}-apigw-5xx`,
 * });
 * ```
 */
export function defineInteropApiGwAlarm(spec: InteropApiGwAlarmSpec): InteropApiGwAlarm {
  const alarms: ReadonlyArray<readonly [string, InteropEnvironment]> = [
    ...INTEROP_ENVIRONMENTS.map((environment) => [spec.alarmName(environment), environment] as const),
    ...(spec.additionalAlarms ?? []).map(({ name, environment }) => [name, environment] as const),
  ];
  const environmentByAlarmName = new Map(alarms);
  const alarmNames = alarms.map(([name]) => name) as [string, ...string[]]; // Safe: INTEROP_ENVIRONMENTS is non-empty.

  return {
    runbookKey: spec.runbookKey,
    serviceName: spec.serviceName,
    ...(spec.podAppFilter === undefined ? {} : { podAppFilter: spec.podAppFilter }),
    varPrefix: spec.varPrefix,
    apiGwProfileId: spec.apiGwProfileId,
    apiGwLogGroupTemplate: INTEROP_API_GW_ACCESS_LOG_GROUP_TEMPLATE,
    applicationLogGroupTemplate: INTEROP_K8S_APPLICATION_LOG_GROUP_TEMPLATE,
    alarmNames,
    stepIds: defaultInteropApiGwRunbookStepIds(spec.serviceName),
    resolveContext(alarmName: string): InteropApiGwAlarmContext {
      const environment = environmentByAlarmName.get(alarmName);
      if (environment === undefined) {
        // Sorted like the registry and catalog descriptors expose alarmNames.
        const expected = [...alarmNames].sort().join(', ');
        throw new Error(`Unsupported INTEROP alarm name "${alarmName}". Expected one of: ${expected}`);
      }
      return {
        alarmName,
        runbookKey: spec.runbookKey,
        environment,
        apiGwId: spec.apiGwIds[environment],
        apiGwLogGroup: buildInteropApiGwAccessLogGroup(environment),
        podApp: spec.serviceName,
        applicationLogGroup: buildInteropK8sApplicationLogGroup(environment),
      };
    },
  };
}
