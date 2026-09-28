import type { InteropApiGwAlarm } from '../interop/InteropApiGwAlarm.js';
import type { InteropApiGwAlarmContext } from '../../../interop/apigw/types/InteropApiGwAlarmContext.js';
import { interop } from '../framework.js';
import { INTEROP_ENVIRONMENTS, isInteropEnvironment, type InteropEnvironment } from '../interop/InteropEnvironment.js';

const RUNBOOK_KEY = 'interop-api-v2-apigw-5xx';
const SERVICE_NAME = 'interop-be-m2m-gateway';
const ALARM_NAMES: readonly [string, ...string[]] = INTEROP_ENVIRONMENTS.map(
  (environment) => `interop-api-v2-${environment}-apigw-5xx`,
) as [string, ...string[]];

const API_GW_IDS: Readonly<Record<InteropEnvironment, string>> = {
  prod: 'rudgz28tel',
  test: 'jrafz6h9c9',
  att: 'c786nyh6f4',
};

function resolveContext(alarmName: string): InteropApiGwAlarmContext {
  const environment = /^interop-api-v2-(?<environment>prod|att|test)-apigw-5xx$/u.exec(alarmName)?.groups?.[
    'environment'
  ];
  if (!isInteropEnvironment(environment)) {
    throw new Error(`Unsupported INTEROP alarm name "${alarmName}". Expected ${ALARM_NAMES.join(', ')}`);
  }

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

export const INTEROP_API_V2_5XX_ALARM: InteropApiGwAlarm = {
  runbookKey: RUNBOOK_KEY,
  serviceName: SERVICE_NAME,
  varPrefix: 'interopM2mGateway',
  apiGwProfileId: 'interop-api-gateway-m2m-v2-5xx',
  apiGwLogGroupTemplate: interop.apigw.INTEROP_API_GW_ACCESS_LOG_GROUP_TEMPLATE,
  applicationLogGroupTemplate: interop.k8s.INTEROP_K8S_APPLICATION_LOG_GROUP_TEMPLATE,
  alarmNames: ALARM_NAMES,
  stepIds: interop.apigw.defaultInteropApiGwRunbookStepIds(SERVICE_NAME),
  resolveContext,
};
