import type { InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';
import type { InteropAlarmContext } from '../interop/InteropAlarmContext.js';
import { interop } from '../framework.js';

const RUNBOOK_KEY = 'k8s-interop-be-authorization-process-errors';
const ALARM_NAME = `${RUNBOOK_KEY}-prod`;
const POD_APP = 'interop-be-authorization-process';

function resolveContext(alarmName: string): InteropAlarmContext {
  if (alarmName !== ALARM_NAME) {
    throw new Error(`Unsupported INTEROP alarm name "${alarmName}". Expected: ${ALARM_NAME}`);
  }

  return {
    alarmName,
    runbookKey: RUNBOOK_KEY,
    environment: 'prod',
    podApp: POD_APP,
    logGroup: interop.k8s.buildInteropK8sApplicationLogGroup('prod'),
  };
}

/** Only the production alarm is documented by Confluence page 2764898487. */
export const AUTHORIZATION_PROCESS_ALARM: InteropK8sAlarm = {
  runbookKey: RUNBOOK_KEY,
  podApp: POD_APP,
  varPrefix: 'interopAuthorizationProcess',
  logGroup: interop.k8s.INTEROP_K8S_APPLICATION_LOG_GROUP_TEMPLATE,
  alarmNames: [ALARM_NAME],
  stepIds: interop.k8s.defaultInteropK8sRunbookStepIds(POD_APP),
  resolveContext,
};
