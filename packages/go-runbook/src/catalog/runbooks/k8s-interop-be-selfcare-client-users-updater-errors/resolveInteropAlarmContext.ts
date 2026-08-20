import { interop } from '../framework.js';

import type { InteropAlarmContext } from '../interop/InteropAlarmContext.js';
import { INTEROP_ENVIRONMENTS, isInteropEnvironment } from '../interop/InteropEnvironment.js';

export const INTEROP_SELFCARE_USERS_UPDATER_RUNBOOK_KEY: string = 'k8s-interop-be-selfcare-client-users-updater-errors';
export const INTEROP_SELFCARE_USERS_UPDATER_SERVICE_NAME: string = 'interop-be-selfcare-client-users-updater';
export const INTEROP_SELFCARE_USERS_UPDATER_VAR_PREFIX: string = 'interopSelfcareUsersUpdater';
export const INTEROP_SELFCARE_USERS_UPDATER_STATIC_LOG_GROUP: string =
  '/aws/eks/interop-eks-cluster-<environment>/application';

export const INTEROP_SELFCARE_USERS_UPDATER_ALARM_NAMES: readonly [string, ...string[]] = INTEROP_ENVIRONMENTS.map(
  (environment) => `${INTEROP_SELFCARE_USERS_UPDATER_RUNBOOK_KEY}-${environment}`,
) as [string, ...string[]]; // Safe: INTEROP_ENVIRONMENTS is a non-empty tuple

const SELFCARE_USERS_UPDATER_ALARM_PATTERN = new RegExp(
  `^${INTEROP_SELFCARE_USERS_UPDATER_RUNBOOK_KEY}-(?<environment>${INTEROP_ENVIRONMENTS.join('|')})$`,
  'u',
);

export function resolveInteropSelfcareUsersUpdaterAlarmContext(alarmName: string): InteropAlarmContext {
  const match = SELFCARE_USERS_UPDATER_ALARM_PATTERN.exec(alarmName);
  const environment = match?.groups?.['environment'];
  if (!isInteropEnvironment(environment)) {
    const expectedAlarmNames = [...INTEROP_SELFCARE_USERS_UPDATER_ALARM_NAMES].sort().join(', ');
    throw new Error(`Unsupported INTEROP alarm name "${alarmName}". Expected one of: ${expectedAlarmNames}`);
  }

  return {
    alarmName,
    runbookKey: INTEROP_SELFCARE_USERS_UPDATER_RUNBOOK_KEY,
    environment,
    podApp: INTEROP_SELFCARE_USERS_UPDATER_SERVICE_NAME,
    logGroup: interop.k8s.buildInteropK8sApplicationLogGroup(environment),
  };
}
