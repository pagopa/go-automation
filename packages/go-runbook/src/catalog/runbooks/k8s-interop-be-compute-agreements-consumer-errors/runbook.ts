import { COMPUTE_AGREEMENTS_CONSUMER_ALARM } from './alarmDefinition.js';
import { interop } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';

const CONFLUENCE_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2739208193/k8s-interop-be-compute-agreements-consumer-errors-prod';

export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    id: COMPUTE_AGREEMENTS_CONSUMER_ALARM.runbookKey,
    metadata: {
      name: COMPUTE_AGREEMENTS_CONSUMER_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del compute agreements consumer leggendo i log applicativi, ' +
        'estraendo i CID e consultando il CID tracker.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'compute', 'agreements', 'consumer', 'kafka'],
    },
    service: {
      name: COMPUTE_AGREEMENTS_CONSUMER_ALARM.podApp,
      logGroup: COMPUTE_AGREEMENTS_CONSUMER_ALARM.logGroup,
      varPrefix: COMPUTE_AGREEMENTS_CONSUMER_ALARM.varPrefix,
    },
    resolveAlarmContext: COMPUTE_AGREEMENTS_CONSUMER_ALARM.resolveContext,
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      runbookName: COMPUTE_AGREEMENTS_CONSUMER_ALARM.runbookKey,
      links: [
        {
          url: CONFLUENCE_RUNBOOK_URL,
          name: COMPUTE_AGREEMENTS_CONSUMER_ALARM.runbookKey,
          type: 'CONFLUENCE',
        },
      ],
    },
  });
}
