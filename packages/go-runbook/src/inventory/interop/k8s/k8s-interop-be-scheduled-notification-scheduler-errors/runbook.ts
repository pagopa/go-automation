import { interop } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';
import { NOTIFICATION_SCHEDULER_ALARM } from './alarmDefinition.js';
import { KNOWN_ERRORS } from './knownErrors.js';
import { NOTIFICATION_SCHEDULER_QUERY_PROFILE } from './queryProfile.js';
import { POD_CONTEXT } from './podContext.js';

const RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3363635346/k8s-interop-be-scheduled-notification-scheduler-errors';

/**
 * Builds the k8s-interop-be-scheduled-notification-scheduler-errors runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    alarm: NOTIFICATION_SCHEDULER_ALARM,
    metadata: {
      name: NOTIFICATION_SCHEDULER_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del scheduled notification scheduler leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'notification', 'scheduler', 'kafka'],
    },
    queryProfile: NOTIFICATION_SCHEDULER_QUERY_PROFILE,
    knownErrors: KNOWN_ERRORS,
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 5 },
    podContext: {
      step: POD_CONTEXT,
      evidenceId: 'notification-scheduler-context',
      evidenceLabel: 'Contesto Kafka del notification scheduler',
    },
    analysisDefaults: {
      runbookName: NOTIFICATION_SCHEDULER_ALARM.runbookKey,
      links: [{ url: RUNBOOK_URL, name: NOTIFICATION_SCHEDULER_ALARM.runbookKey, type: 'CONFLUENCE' }],
    },
  });
}
