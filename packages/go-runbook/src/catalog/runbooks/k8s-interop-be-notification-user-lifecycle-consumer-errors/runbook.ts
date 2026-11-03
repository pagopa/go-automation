import { NOTIFICATION_USER_LIFECYCLE_ALARM } from './alarmDefinition.js';
import { interop } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';
import { NOTIFICATION_USER_LIFECYCLE_QUERY_PROFILE } from './queryProfile.js';

export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    id: NOTIFICATION_USER_LIFECYCLE_ALARM.runbookKey,
    metadata: {
      name: NOTIFICATION_USER_LIFECYCLE_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del notification user lifecycle consumer leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.0.1',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'notification', 'kafka'],
    },
    service: {
      name: NOTIFICATION_USER_LIFECYCLE_ALARM.podApp,
      logGroup: NOTIFICATION_USER_LIFECYCLE_ALARM.logGroup,
      varPrefix: NOTIFICATION_USER_LIFECYCLE_ALARM.varPrefix,
    },
    resolveAlarmContext: NOTIFICATION_USER_LIFECYCLE_ALARM.resolveContext,
    queryProfile: NOTIFICATION_USER_LIFECYCLE_QUERY_PROFILE,
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      runbookName: NOTIFICATION_USER_LIFECYCLE_ALARM.runbookKey,
      finalActions: [],
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2659549286/k8s-interop-be-notification-user-lifecycle-consumer-errors',
          name: NOTIFICATION_USER_LIFECYCLE_ALARM.runbookKey,
          type: 'CONFLUENCE',
        },
      ],
    },
  });
}
