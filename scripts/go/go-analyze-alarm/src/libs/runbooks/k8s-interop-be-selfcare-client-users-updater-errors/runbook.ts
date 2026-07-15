import { interop } from '@go-automation/go-runbook';
import type { Runbook } from '@go-automation/go-runbook';

import { KNOWN_CASES } from './knownCases.js';
import {
  INTEROP_SELFCARE_USERS_UPDATER_RUNBOOK_KEY,
  INTEROP_SELFCARE_USERS_UPDATER_SERVICE_NAME,
  INTEROP_SELFCARE_USERS_UPDATER_STATIC_LOG_GROUP,
  INTEROP_SELFCARE_USERS_UPDATER_VAR_PREFIX,
  resolveInteropSelfcareUsersUpdaterAlarmContext,
} from './resolveInteropAlarmContext.js';

export function buildK8sInteropBeSelfcareClientUsersUpdaterErrorsRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    id: INTEROP_SELFCARE_USERS_UPDATER_RUNBOOK_KEY,
    metadata: {
      name: INTEROP_SELFCARE_USERS_UPDATER_RUNBOOK_KEY,
      description:
        'Analizza gli allarmi k8s INTEROP del selfcare client users updater leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'selfcare', 'kafka'],
    },
    service: {
      name: INTEROP_SELFCARE_USERS_UPDATER_SERVICE_NAME,
      logGroup: INTEROP_SELFCARE_USERS_UPDATER_STATIC_LOG_GROUP,
      varPrefix: INTEROP_SELFCARE_USERS_UPDATER_VAR_PREFIX,
    },
    resolveAlarmContext: resolveInteropSelfcareUsersUpdaterAlarmContext,
    knownCases: KNOWN_CASES,
  });
}
