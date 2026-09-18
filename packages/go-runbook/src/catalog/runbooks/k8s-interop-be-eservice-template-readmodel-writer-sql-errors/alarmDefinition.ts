import type { InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';
import type { InteropAlarmContext } from '../interop/InteropAlarmContext.js';
import type { InteropEnvironment } from '../interop/InteropEnvironment.js';
import { interop } from '../framework.js';

const RUNBOOK_KEY = 'k8s-interop-be-eservice-template-readmodel-writer-sql-errors';
const POD_APP = 'interop-be-eservice-template-readmodel-writer-sql';
const ALARM_NAMES: readonly [string, string] = [`${RUNBOOK_KEY}-prod`, `${RUNBOOK_KEY}-att`];
const ENVIRONMENT_BY_ALARM_NAME = new Map<string, InteropEnvironment>([
  [ALARM_NAMES[0], 'prod'],
  [ALARM_NAMES[1], 'att'],
]);

function resolveContext(alarmName: string): InteropAlarmContext {
  const environment = ENVIRONMENT_BY_ALARM_NAME.get(alarmName);
  if (environment === undefined) {
    throw new Error(`Unsupported INTEROP alarm name "${alarmName}". Expected one of: ${ALARM_NAMES.join(', ')}`);
  }

  return {
    alarmName,
    runbookKey: RUNBOOK_KEY,
    environment,
    podApp: POD_APP,
    logGroup: interop.k8s.buildInteropK8sApplicationLogGroup(environment),
  };
}

/** Only the production and attestation alarms are documented by Confluence page 3172728872. */
export const ESERVICE_TEMPLATE_READMODEL_WRITER_SQL_ALARM: InteropK8sAlarm = {
  runbookKey: RUNBOOK_KEY,
  podApp: POD_APP,
  varPrefix: 'interopEserviceTemplateReadmodelWriterSql',
  logGroup: interop.k8s.INTEROP_K8S_APPLICATION_LOG_GROUP_TEMPLATE,
  alarmNames: ALARM_NAMES,
  stepIds: interop.k8s.defaultInteropK8sRunbookStepIds(POD_APP),
  resolveContext,
};
