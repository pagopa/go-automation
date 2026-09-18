import { interop, type Runbook } from '../framework.js';
import { ISTAT_IMPORTER_ALARM as alarm } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';

export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    id: alarm.runbookKey,
    metadata: {
      name: alarm.runbookKey,
      description:
        'Analizza gli errori dell’importer degli attributi certificati ISTAT in prod, att e test, correlando i CID e le indicazioni delle card PIN-10543 e PIN-10823.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'istat', 'certified-attributes', 'importer'],
    },
    service: { name: alarm.podApp, logGroup: alarm.logGroup, varPrefix: alarm.varPrefix },
    resolveAlarmContext: alarm.resolveContext,
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      runbookName: alarm.runbookKey,
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3197961176/k8s-interop-be-istat-certified-attributes-importer-errors',
          name: alarm.runbookKey,
          type: 'CONFLUENCE',
        },
      ],
    },
  });
}
