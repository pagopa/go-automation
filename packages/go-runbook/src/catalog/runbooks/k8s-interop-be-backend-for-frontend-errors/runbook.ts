import { interop } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';
import {
  INTEROP_BFF_RUNBOOK_KEY,
  INTEROP_BFF_SERVICE_NAME,
  INTEROP_BFF_STATIC_LOG_GROUP,
  INTEROP_BFF_VAR_PREFIX,
  resolveInteropBffAlarmContext,
} from './resolveInteropAlarmContext.js';

export function buildK8sInteropBeBackendForFrontendErrorsRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    id: INTEROP_BFF_RUNBOOK_KEY,
    metadata: {
      name: INTEROP_BFF_RUNBOOK_KEY,
      description:
        'Analizza gli allarmi k8s INTEROP del backend-for-frontend leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'backend-for-frontend'],
    },
    service: {
      name: INTEROP_BFF_SERVICE_NAME,
      logGroup: INTEROP_BFF_STATIC_LOG_GROUP,
      varPrefix: INTEROP_BFF_VAR_PREFIX,
    },
    resolveAlarmContext: resolveInteropBffAlarmContext,
    knownCases: KNOWN_CASES,
  });
}
