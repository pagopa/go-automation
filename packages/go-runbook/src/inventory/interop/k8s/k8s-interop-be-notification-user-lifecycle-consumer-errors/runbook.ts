import { NOTIFICATION_USER_LIFECYCLE_ALARM } from './alarmDefinition.js';
import { interop } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';

import { KNOWN_ERRORS } from './knownErrors.js';
import { NOTIFICATION_USER_LIFECYCLE_QUERY_PROFILE } from './queryProfile.js';

/**
 * Builds the k8s-interop-be-notification-user-lifecycle-consumer-errors runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    alarm: NOTIFICATION_USER_LIFECYCLE_ALARM,
    metadata: {
      name: NOTIFICATION_USER_LIFECYCLE_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del notification user lifecycle consumer leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.0.1',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'notification', 'kafka'],
    },
    queryProfile: NOTIFICATION_USER_LIFECYCLE_QUERY_PROFILE,
    knownErrors: KNOWN_ERRORS,
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
