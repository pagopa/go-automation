import { interop } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';
import { IN_APP_NOTIFICATION_DISPATCHER_ALARM as alarm } from './alarmDefinition.js';
import { KNOWN_ERRORS } from './knownErrors.js';

const CONFLUENCE_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3062825037/k8s-interop-be-in-app-notification-dispatcher-errors';

/**
 * Builds the k8s-interop-be-in-app-notification-dispatcher-errors runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    alarm,
    metadata: {
      name: alarm.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP dell’in-app notification dispatcher, estrae i CID e consulta i log correlati.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'notification', 'kafka'],
    },
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 },
    knownErrors: KNOWN_ERRORS,
    analysisDefaults: {
      runbookName: alarm.runbookKey,
      links: [{ url: CONFLUENCE_RUNBOOK_URL, name: alarm.runbookKey, type: 'CONFLUENCE' }],
    },
  });
}
