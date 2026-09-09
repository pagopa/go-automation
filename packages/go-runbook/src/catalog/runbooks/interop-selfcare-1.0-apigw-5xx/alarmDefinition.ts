import type { InteropApiGwAlarmContext } from '../../../interop/apigw/types/InteropApiGwAlarmContext.js';
import type { InteropApiGwAlarm } from '../interop/InteropApiGwAlarm.js';
import { interop } from '../framework.js';
import type { InteropEnvironment } from '../interop/InteropEnvironment.js';
import { INTEROP_ENVIRONMENTS, isInteropEnvironment } from '../interop/InteropEnvironment.js';

/** Alarm context of the Selfcare runbook, narrowed to the supported environments. */
export interface InteropSelfcareApiGwAlarmContext extends InteropApiGwAlarmContext {
  readonly environment: InteropEnvironment;
}

const RUNBOOK_KEY = 'interop-selfcare-1.0-apigw-5xx';
const SERVICE_NAME = 'interop-be-backend-for-frontend';

/** The environment sits in the middle of the alarm name, not at the end. */
const ALARM_NAMES: readonly [string, ...string[]] = INTEROP_ENVIRONMENTS.map(
  (environment) => `interop-selfcare-1.0-${environment}-apigw-5xx`,
) as [string, ...string[]]; // Safe: INTEROP_ENVIRONMENTS is a non-empty tuple

const API_GW_IDS: Readonly<Record<InteropEnvironment, string>> = {
  prod: 'tf9isbi4pi',
  att: '5sfghk09qb',
  test: 'an24tfmqw3',
};

const ALARM_PATTERN = /^interop-selfcare-1\.0-(?<environment>prod|att|test)-apigw-5xx$/u;

function resolveContext(alarmName: string): InteropSelfcareApiGwAlarmContext {
  const environment = ALARM_PATTERN.exec(alarmName)?.groups?.['environment'];
  if (!isInteropEnvironment(environment)) {
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
 * INTEROP Selfcare API Gateway alarm.
 *
 * Same shape as the k8s family's `defineInteropK8sAlarm` output; assembled by
 * hand because the API Gateway ids do not follow from the runbook key.
 */
export const SELFCARE_ALARM: InteropApiGwAlarm<InteropSelfcareApiGwAlarmContext> = {
  runbookKey: RUNBOOK_KEY,
  serviceName: SERVICE_NAME,
  varPrefix: 'interopBff',
  /** Profile advertised in `runbookContext`; describes this runbook. */
  apiGwProfileId: 'interop-api-gateway-bff-5xx',
  apiGwLogGroupTemplate: interop.apigw.INTEROP_API_GW_ACCESS_LOG_GROUP_TEMPLATE,
  applicationLogGroupTemplate: interop.k8s.INTEROP_K8S_APPLICATION_LOG_GROUP_TEMPLATE,
  alarmNames: ALARM_NAMES,
  stepIds: interop.apigw.defaultInteropApiGwRunbookStepIds(SERVICE_NAME),
  resolveContext,
};
