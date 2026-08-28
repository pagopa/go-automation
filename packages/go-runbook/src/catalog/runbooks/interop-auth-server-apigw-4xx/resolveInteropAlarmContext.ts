import type { InteropApiGwAlarmContext } from '../../../interop/apigw/types/InteropApiGwAlarmContext.js';
import { interop } from '../framework.js';
import type { InteropEnvironment } from '../interop/InteropEnvironment.js';
import { isInteropEnvironment } from '../interop/InteropEnvironment.js';

export interface InteropAuthServerApiGwAlarmContext extends InteropApiGwAlarmContext {
  readonly environment: InteropEnvironment;
}

export const INTEROP_AUTH_SERVER_API_GW_RUNBOOK_KEY = 'interop-auth-server-apigw-4xx';
export const INTEROP_AUTH_SERVER_SERVICE_NAME = 'interop-be-authorization-server-node';
export const INTEROP_AUTH_SERVER_POD_APP_FILTER = 'interop-be-authorization-server';
export const INTEROP_AUTH_SERVER_VAR_PREFIX = 'interopAuthServer';
export const INTEROP_AUTH_SERVER_API_GW_PROFILE_ID = 'interop-api-gateway-auth-server-4xx';
export const INTEROP_AUTH_SERVER_API_GW_LOG_GROUP_TEMPLATE: string =
  interop.apigw.INTEROP_API_GW_ACCESS_LOG_GROUP_TEMPLATE;
export const INTEROP_AUTH_SERVER_APPLICATION_LOG_GROUP_TEMPLATE: string =
  interop.k8s.INTEROP_K8S_APPLICATION_LOG_GROUP_TEMPLATE;

/** Actual CloudWatch alarms: the low-request variant exists only in att and test. */
export const INTEROP_AUTH_SERVER_API_GW_ALARM_NAMES: readonly [string, ...string[]] = [
  'interop-auth-server-prod-apigw-4xx',
  'interop-auth-server-att-apigw-4xx',
  'interop-auth-server-test-apigw-4xx',
  'interop-auth-server-att-apigw-4xx-low-requests',
  'interop-auth-server-test-apigw-4xx-low-requests',
];

const API_GW_IDS: Readonly<Record<InteropEnvironment, string>> = {
  prod: 'ffmbmcmreh',
  test: 'q9ocrukty2',
  att: '70ar087an0',
};

const SUPPORTED_ALARM_NAMES: ReadonlySet<string> = new Set(INTEROP_AUTH_SERVER_API_GW_ALARM_NAMES);
const ALARM_PATTERN = /^interop-auth-server-(?<environment>prod|att|test)-apigw-4xx(?:-low-requests)?$/u;

export function resolveInteropAuthServerApiGwAlarmContext(alarmName: string): InteropAuthServerApiGwAlarmContext {
  const environment = ALARM_PATTERN.exec(alarmName)?.groups?.['environment'];
  if (!SUPPORTED_ALARM_NAMES.has(alarmName) || !isInteropEnvironment(environment)) {
    const expectedAlarmNames = [...INTEROP_AUTH_SERVER_API_GW_ALARM_NAMES].sort().join(', ');
    throw new Error(`Unsupported INTEROP alarm name "${alarmName}". Expected one of: ${expectedAlarmNames}`);
  }

  return {
    alarmName,
    runbookKey: INTEROP_AUTH_SERVER_API_GW_RUNBOOK_KEY,
    environment,
    apiGwId: API_GW_IDS[environment],
    apiGwLogGroup: interop.apigw.buildInteropApiGwAccessLogGroup(environment),
    podApp: INTEROP_AUTH_SERVER_SERVICE_NAME,
    applicationLogGroup: interop.k8s.buildInteropK8sApplicationLogGroup(environment),
  };
}
