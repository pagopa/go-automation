import { interop } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';
import { NOTIFICATION_CONFIG_READMODEL_WRITER_SQL_ALARM as alarm } from './alarmDefinition.js';
import { KNOWN_ERRORS } from './knownErrors.js';

const CONFLUENCE_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3363537202/k8s-interop-be-notification-config-readmodel-writer-sql-errors';

/**
 * Builds the k8s-interop-be-notification-config-readmodel-writer-sql-errors runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    alarm,
    metadata: {
      name: alarm.runbookKey,
      description:
        'Analizza l’allarme k8s del notification config readmodel writer SQL, estrae i CID e consulta i log correlati.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'notification', 'readmodel', 'sql', 'kafka'],
    },
    knownErrors: KNOWN_ERRORS,
    analysisDefaults: {
      runbookName: alarm.runbookKey,
      links: [{ url: CONFLUENCE_RUNBOOK_URL, name: alarm.runbookKey, type: 'CONFLUENCE' }],
    },
  });
}
