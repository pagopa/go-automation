import { interop } from '../framework.js';
import type { InteropApiGwAlarmContext } from '../../../interop/apigw/types/InteropApiGwAlarmContext.js';

import type { InteropEnvironment } from '../interop/InteropEnvironment.js';
import { INTEROP_ENVIRONMENTS, isInteropEnvironment } from '../interop/InteropEnvironment.js';

export interface InteropSelfcareApiGwAlarmContext extends InteropApiGwAlarmContext {
  readonly environment: InteropEnvironment;
}

export const INTEROP_SELFCARE_API_GW_RUNBOOK_KEY: string = 'interop-selfcare-1.0-apigw-5xx';
export const INTEROP_SELFCARE_API_GW_SERVICE_NAME: string = 'interop-be-backend-for-frontend';
export const INTEROP_SELFCARE_API_GW_VAR_PREFIX: string = 'interopBff';
export const INTEROP_SELFCARE_API_GW_PROFILE_ID: string = 'interop-api-gateway-bff-5xx';
export const INTEROP_SELFCARE_API_GW_LOG_GROUP_TEMPLATE: string =
  interop.apigw.INTEROP_API_GW_ACCESS_LOG_GROUP_TEMPLATE;
export const INTEROP_SELFCARE_APPLICATION_LOG_GROUP_TEMPLATE: string =
  interop.k8s.INTEROP_K8S_APPLICATION_LOG_GROUP_TEMPLATE;

export const INTEROP_SELFCARE_API_GW_ALARM_NAMES: readonly [string, ...string[]] = INTEROP_ENVIRONMENTS.map(
  (environment) => `interop-selfcare-1.0-${environment}-apigw-5xx`,
) as [string, ...string[]]; // Safe: INTEROP_ENVIRONMENTS is a non-empty tuple

const API_GW_IDS: Readonly<Record<InteropEnvironment, string>> = {
  prod: 'tf9isbi4pi',
  att: '5sfghk09qb',
  test: 'an24tfmqw3',
};

const ALARM_PATTERN = /^interop-selfcare-1\.0-(?<environment>prod|att|test)-apigw-5xx$/u;

export function resolveInteropSelfcareApiGwAlarmContext(alarmName: string): InteropSelfcareApiGwAlarmContext {
  const environment = ALARM_PATTERN.exec(alarmName)?.groups?.['environment'];
  if (!isInteropEnvironment(environment)) {
    const expectedAlarmNames = [...INTEROP_SELFCARE_API_GW_ALARM_NAMES].sort().join(', ');
    throw new Error(`Unsupported INTEROP alarm name "${alarmName}". Expected one of: ${expectedAlarmNames}`);
  }

  return {
    alarmName,
    runbookKey: INTEROP_SELFCARE_API_GW_RUNBOOK_KEY,
    environment,
    apiGwId: API_GW_IDS[environment],
    apiGwLogGroup: interop.apigw.buildInteropApiGwAccessLogGroup(environment),
    podApp: INTEROP_SELFCARE_API_GW_SERVICE_NAME,
    applicationLogGroup: interop.k8s.buildInteropK8sApplicationLogGroup(environment),
  };
}
