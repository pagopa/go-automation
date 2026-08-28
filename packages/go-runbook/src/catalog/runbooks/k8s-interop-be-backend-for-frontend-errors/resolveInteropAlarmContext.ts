import { interop } from '../framework.js';

import type { InteropAlarmContext } from '../interop/InteropAlarmContext.js';
import type { InteropEnvironment } from '../interop/InteropEnvironment.js';
import { INTEROP_ENVIRONMENTS, isInteropEnvironment } from '../interop/InteropEnvironment.js';

export const INTEROP_BFF_RUNBOOK_KEY: string = 'k8s-interop-be-backend-for-frontend-errors';
export const INTEROP_BFF_SERVICE_NAME: string = 'interop-be-backend-for-frontend';
export const INTEROP_BFF_VAR_PREFIX: string = 'interopBff';
export const INTEROP_BFF_STATIC_LOG_GROUP: string = interop.k8s.INTEROP_K8S_APPLICATION_LOG_GROUP_TEMPLATE;

export const INTEROP_BFF_ALARM_NAMES: readonly [string, ...string[]] = INTEROP_ENVIRONMENTS.map(
  (environment) => `${INTEROP_BFF_RUNBOOK_KEY}-${environment}`,
) as [string, ...string[]]; // Safe: INTEROP_ENVIRONMENTS is a non-empty tuple

// The runbook key is a plain slug (alphanumerics and "-"), so it can be
// interpolated without regex escaping.
const BFF_ALARM_PATTERN = new RegExp(
  `^${INTEROP_BFF_RUNBOOK_KEY}-(?<environment>${INTEROP_ENVIRONMENTS.join('|')})$`,
  'u',
);

export function resolveInteropBffAlarmContext(alarmName: string): InteropAlarmContext {
  const match = BFF_ALARM_PATTERN.exec(alarmName);
  const environment = match?.groups?.['environment'];
  if (!isInteropEnvironment(environment)) {
    // Sorted like the registry/catalog descriptors expose alarmNames.
    const expectedAlarmNames = [...INTEROP_BFF_ALARM_NAMES].sort().join(', ');
    throw new Error(`Unsupported INTEROP alarm name "${alarmName}". Expected one of: ${expectedAlarmNames}`);
  }

  return {
    alarmName,
    runbookKey: INTEROP_BFF_RUNBOOK_KEY,
    environment,
    podApp: INTEROP_BFF_SERVICE_NAME,
    logGroup: buildInteropApplicationLogGroup(environment),
  };
}

export function buildInteropApplicationLogGroup(environment: InteropEnvironment): string {
  return interop.k8s.buildInteropK8sApplicationLogGroup(environment);
}
