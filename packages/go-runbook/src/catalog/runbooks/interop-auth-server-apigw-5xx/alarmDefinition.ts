import type { InteropApiGwAlarm } from '../interop/InteropApiGwAlarm.js';
import type { InteropApiGwAlarmContext } from '../../../interop/apigw/types/InteropApiGwAlarmContext.js';
import { interop } from '../framework.js';
import { INTEROP_ENVIRONMENTS, isInteropEnvironment, type InteropEnvironment } from '../interop/InteropEnvironment.js';

const RUNBOOK_KEY = 'interop-auth-server-apigw-5xx';
const ALARM_NAMES: readonly [string, ...string[]] = INTEROP_ENVIRONMENTS.map(
  (environment) => `interop-auth-server-${environment}-apigw-5xx`,
) as [string, ...string[]];
const SERVICE_NAME = 'interop-be-authorization-server-node';
const API_GW_IDS: Readonly<Record<InteropEnvironment, string>> = {
  prod: 'ffmbmcmreh',
  att: '70ar087an0',
  test: 'q9ocrukty2',
};

function resolveContext(alarmName: string): InteropApiGwAlarmContext {
  const environment = /^interop-auth-server-(?<environment>prod|att|test)-apigw-5xx$/u.exec(alarmName)?.groups?.[
    'environment'
  ];
  if (!isInteropEnvironment(environment))
    throw new Error(`Unsupported INTEROP alarm name "${alarmName}". Expected ${ALARM_NAMES.join(', ')}`);
  return {
    alarmName,
    runbookKey: RUNBOOK_KEY,
    environment,
    apiGwId: API_GW_IDS[environment],
    apiGwLogGroup: interop.apigw.buildInteropApiGwAccessLogGroup(environment),
    podApp: SERVICE_NAME,
    applicationLogGroup: interop.k8s.buildInteropK8sApplicationLogGroup(environment),
  };
}

/** Confluence page 2111078419 cases, extended to the auth-server gateways in prod, att and test. */
export const AUTH_SERVER_5XX_ALARM: InteropApiGwAlarm = {
  runbookKey: RUNBOOK_KEY,
  serviceName: SERVICE_NAME,
  podAppFilter: 'interop-be-authorization-server',
  varPrefix: 'interopAuthServer',
  apiGwProfileId: 'interop-api-gateway-auth-server-5xx',
  apiGwLogGroupTemplate: interop.apigw.INTEROP_API_GW_ACCESS_LOG_GROUP_TEMPLATE,
  applicationLogGroupTemplate: interop.k8s.INTEROP_K8S_APPLICATION_LOG_GROUP_TEMPLATE,
  alarmNames: ALARM_NAMES,
  stepIds: interop.apigw.defaultInteropApiGwRunbookStepIds(SERVICE_NAME),
  resolveContext,
};
