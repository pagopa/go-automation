import type { InteropApiGwAlarmContext } from '../../../interop/apigw/types/InteropApiGwAlarmContext.js';
import type { InteropApiGwAlarm } from '../interop/InteropApiGwAlarm.js';
import { interop } from '../framework.js';
import type { InteropEnvironment } from '../interop/InteropEnvironment.js';
import { isInteropEnvironment } from '../interop/InteropEnvironment.js';

/** Alarm context of the auth-server runbook, narrowed to the supported environments. */
export interface InteropAuthServerApiGwAlarmContext extends InteropApiGwAlarmContext {
  readonly environment: InteropEnvironment;
}

const RUNBOOK_KEY = 'interop-auth-server-apigw-4xx';
const SERVICE_NAME = 'interop-be-authorization-server-node';

/**
 * Actual CloudWatch alarms. Unlike the k8s family these are not derived from
 * the runbook key: the low-request variant exists only in att and test, so the
 * list is asymmetric and stays explicit.
 */
const ALARM_NAMES: readonly [string, ...string[]] = [
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

const SUPPORTED_ALARM_NAMES: ReadonlySet<string> = new Set(ALARM_NAMES);

// The pattern alone would accept `…-prod-apigw-4xx-low-requests`, an alarm that
// does not exist; the name set is what rejects it.
const ALARM_PATTERN = /^interop-auth-server-(?<environment>prod|att|test)-apigw-4xx(?:-low-requests)?$/u;

function resolveContext(alarmName: string): InteropAuthServerApiGwAlarmContext {
  const environment = ALARM_PATTERN.exec(alarmName)?.groups?.['environment'];
  if (!SUPPORTED_ALARM_NAMES.has(alarmName) || !isInteropEnvironment(environment)) {
    const expected = [...ALARM_NAMES].sort().join(', ');
    throw new Error(`Unsupported INTEROP alarm name "${alarmName}". Expected one of: ${expected}`);
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

/**
 * Everything the runbook, its known cases and the registry need about the
 * INTEROP auth-server API Gateway alarm.
 *
 * Same shape as the k8s family's `defineInteropK8sAlarm` output; assembled by
 * hand because the alarm names and the API Gateway ids do not follow from the
 * runbook key.
 */
export const AUTH_SERVER_ALARM: InteropApiGwAlarm<InteropAuthServerApiGwAlarmContext> = {
  runbookKey: RUNBOOK_KEY,
  serviceName: SERVICE_NAME,
  /** The pods are named `…-node` but the query filter matches the broader family. */
  podAppFilter: 'interop-be-authorization-server',
  varPrefix: 'interopAuthServer',
  /** Profile advertised in `runbookContext`; describes this runbook. */
  apiGwProfileId: 'interop-api-gateway-auth-server-4xx',
  apiGwLogGroupTemplate: interop.apigw.INTEROP_API_GW_ACCESS_LOG_GROUP_TEMPLATE,
  applicationLogGroupTemplate: interop.k8s.INTEROP_K8S_APPLICATION_LOG_GROUP_TEMPLATE,
  alarmNames: ALARM_NAMES,
  stepIds: interop.apigw.defaultInteropApiGwRunbookStepIds(SERVICE_NAME),
  resolveContext,
};
