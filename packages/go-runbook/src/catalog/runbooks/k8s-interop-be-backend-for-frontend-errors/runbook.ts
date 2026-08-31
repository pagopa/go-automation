import { BFF_ALARM } from './alarmDefinition.js';
import { interop } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';

export function buildK8sInteropBeBackendForFrontendErrorsRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    id: BFF_ALARM.runbookKey,
    metadata: {
      name: BFF_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del backend-for-frontend leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'backend-for-frontend'],
    },
    service: {
      name: BFF_ALARM.podApp,
      logGroup: BFF_ALARM.logGroup,
      varPrefix: BFF_ALARM.varPrefix,
    },
    resolveAlarmContext: BFF_ALARM.resolveContext,
    knownCases: KNOWN_CASES,
  });
}
