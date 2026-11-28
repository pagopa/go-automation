import { interop } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';
import { AGREEMENT_READMODEL_WRITER_SQL_ALARM as alarm } from './alarmDefinition.js';
import { KNOWN_ERRORS } from './knownErrors.js';
import { AGREEMENT_READMODEL_WRITER_SQL_QUERY_PROFILE } from './queryProfile.js';

const CONFLUENCE_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3212745125/k8s-interop-be-agreement-readmodel-writer-sql-errors';

/**
 * Builds the k8s-interop-be-agreement-readmodel-writer-sql-errors runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    alarm,
    metadata: {
      name: alarm.runbookKey,
      description:
        'Analizza gli errori dell’agreement readmodel writer SQL INTEROP e raccoglie i CID e i log correlati per verificare il caso Kafka.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'agreement', 'readmodel', 'kafka'],
    },
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 },
    queryProfile: AGREEMENT_READMODEL_WRITER_SQL_QUERY_PROFILE,
    knownErrors: KNOWN_ERRORS,
    analysisDefaults: {
      runbookName: alarm.runbookKey,
      links: [{ url: CONFLUENCE_RUNBOOK_URL, name: alarm.runbookKey, type: 'CONFLUENCE' }],
    },
  });
}
