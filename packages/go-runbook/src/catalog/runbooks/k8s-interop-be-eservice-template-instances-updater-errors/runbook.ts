import { interop, type Runbook } from '../framework.js';
import { ESERVICE_TEMPLATE_INSTANCES_UPDATER_ALARM as alarm } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';
import { ESERVICE_TEMPLATE_INSTANCES_UPDATER_QUERY_PROFILE } from './queryProfile.js';

const CONFLUENCE_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3367141537/k8s-interop-be-eservice-template-instances-updater-errors';

export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    id: alarm.runbookKey,
    metadata: {
      name: alarm.runbookKey,
      description:
        'Analizza gli errori dell’updater delle istanze di template e-service INTEROP e raccoglie CID e log per verificare il caso Kafka.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'eservice-template', 'kafka'],
    },
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 },
    service: { name: alarm.podApp, logGroup: alarm.logGroup, varPrefix: alarm.varPrefix },
    resolveAlarmContext: alarm.resolveContext,
    queryProfile: ESERVICE_TEMPLATE_INSTANCES_UPDATER_QUERY_PROFILE,
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      runbookName: alarm.runbookKey,
      links: [{ url: CONFLUENCE_RUNBOOK_URL, name: alarm.runbookKey, type: 'CONFLUENCE' }],
    },
  });
}
