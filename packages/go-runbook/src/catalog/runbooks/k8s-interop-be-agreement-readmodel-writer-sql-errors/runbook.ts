import { interop, type Runbook } from '../framework.js';
import { AGREEMENT_READMODEL_WRITER_SQL_ALARM as alarm } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';
import { AGREEMENT_READMODEL_WRITER_SQL_QUERY_PROFILE } from './queryProfile.js';

const CONFLUENCE_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3212745125/k8s-interop-be-agreement-readmodel-writer-sql-errors';

export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    id: alarm.runbookKey,
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
    service: { name: alarm.podApp, logGroup: alarm.logGroup, varPrefix: alarm.varPrefix },
    resolveAlarmContext: alarm.resolveContext,
    queryProfile: AGREEMENT_READMODEL_WRITER_SQL_QUERY_PROFILE,
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      runbookName: alarm.runbookKey,
      links: [{ url: CONFLUENCE_RUNBOOK_URL, name: alarm.runbookKey, type: 'CONFLUENCE' }],
    },
  });
}
