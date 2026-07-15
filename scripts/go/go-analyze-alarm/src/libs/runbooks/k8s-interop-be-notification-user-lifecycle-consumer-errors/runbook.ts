import { interop } from '@go-automation/go-runbook';
import type { Runbook } from '@go-automation/go-runbook';

import { KNOWN_CASES } from './knownCases.js';
import {
  INTEROP_NOTIFICATION_USER_LIFECYCLE_RUNBOOK_KEY,
  INTEROP_NOTIFICATION_USER_LIFECYCLE_SERVICE_NAME,
  INTEROP_NOTIFICATION_USER_LIFECYCLE_STATIC_LOG_GROUP,
  INTEROP_NOTIFICATION_USER_LIFECYCLE_VAR_PREFIX,
  resolveInteropNotificationUserLifecycleAlarmContext,
} from './resolveInteropAlarmContext.js';

export function buildK8sInteropBeNotificationUserLifecycleConsumerErrorsRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    id: INTEROP_NOTIFICATION_USER_LIFECYCLE_RUNBOOK_KEY,
    metadata: {
      name: INTEROP_NOTIFICATION_USER_LIFECYCLE_RUNBOOK_KEY,
      description:
        'Analizza gli allarmi k8s INTEROP del notification user lifecycle consumer leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'notification', 'kafka'],
    },
    service: {
      name: INTEROP_NOTIFICATION_USER_LIFECYCLE_SERVICE_NAME,
      logGroup: INTEROP_NOTIFICATION_USER_LIFECYCLE_STATIC_LOG_GROUP,
      varPrefix: INTEROP_NOTIFICATION_USER_LIFECYCLE_VAR_PREFIX,
    },
    resolveAlarmContext: resolveInteropNotificationUserLifecycleAlarmContext,
    knownCases: KNOWN_CASES,
  });
}
