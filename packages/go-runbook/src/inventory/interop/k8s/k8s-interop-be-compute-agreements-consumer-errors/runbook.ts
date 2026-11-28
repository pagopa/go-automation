import { COMPUTE_AGREEMENTS_CONSUMER_ALARM } from './alarmDefinition.js';
import { interop } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';

import { KNOWN_ERRORS } from './knownErrors.js';

const CONFLUENCE_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2739208193/k8s-interop-be-compute-agreements-consumer-errors-prod';

/**
 * Builds the k8s-interop-be-compute-agreements-consumer-errors runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    alarm: COMPUTE_AGREEMENTS_CONSUMER_ALARM,
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
    knownErrors: KNOWN_ERRORS,
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
