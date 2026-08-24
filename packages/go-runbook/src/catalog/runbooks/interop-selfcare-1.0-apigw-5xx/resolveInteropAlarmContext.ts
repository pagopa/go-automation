import { interop } from '../framework.js';

import type { InteropEnvironment } from '../interop/InteropEnvironment.js';
import { INTEROP_ENVIRONMENTS, isInteropEnvironment } from '../interop/InteropEnvironment.js';

export interface InteropSelfcareApiGwAlarmContext {
  readonly alarmName: string;
  readonly runbookKey: string;
  readonly environment: InteropEnvironment;
  readonly apiGwId: string;
  readonly apiGwLogGroup: string;
  readonly podApp: string;
  readonly applicationLogGroup: string;
}

export const INTEROP_SELFCARE_API_GW_RUNBOOK_KEY: string = 'interop-selfcare-1.0-apigw-5xx';
export const INTEROP_SELFCARE_API_GW_SERVICE_NAME: string = 'interop-be-backend-for-frontend';
export const INTEROP_SELFCARE_API_GW_VAR_PREFIX: string = 'interopBff';
export const INTEROP_SELFCARE_API_GW_PROFILE_ID: string = 'interop-api-gateway-bff-5xx';
export const INTEROP_SELFCARE_API_GW_LOG_GROUP_TEMPLATE: string = 'amazon-apigateway-interop-access-logs-<environment>';
export const INTEROP_SELFCARE_APPLICATION_LOG_GROUP_TEMPLATE: string =
  '/aws/eks/interop-eks-cluster-<environment>/application';

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
    apiGwLogGroup: buildInteropApiGwAccessLogGroup(environment),
    podApp: INTEROP_SELFCARE_API_GW_SERVICE_NAME,
    applicationLogGroup: interop.k8s.buildInteropK8sApplicationLogGroup(environment),
  };
}

export function buildInteropApiGwAccessLogGroup(environment: InteropEnvironment): string {
  return INTEROP_SELFCARE_API_GW_LOG_GROUP_TEMPLATE.replace('<environment>', environment);
}
