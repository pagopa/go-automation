import { SELFCARE_USERS_UPDATER_ALARM } from './alarmDefinition.js';
import { interop } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';

export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    id: SELFCARE_USERS_UPDATER_ALARM.runbookKey,
    metadata: {
      name: SELFCARE_USERS_UPDATER_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del selfcare client users updater leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'selfcare', 'kafka'],
    },
    service: {
      name: SELFCARE_USERS_UPDATER_ALARM.podApp,
      logGroup: SELFCARE_USERS_UPDATER_ALARM.logGroup,
      varPrefix: SELFCARE_USERS_UPDATER_ALARM.varPrefix,
    },
    resolveAlarmContext: SELFCARE_USERS_UPDATER_ALARM.resolveContext,
    knownCases: KNOWN_CASES,
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 },
  });
}
