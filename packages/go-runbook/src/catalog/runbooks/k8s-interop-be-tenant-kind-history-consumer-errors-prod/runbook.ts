/**
 * Runbook: k8s-interop-be-tenant-kind-history-consumer-errors-prod
 */

import { interop } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';
import { TENANT_KIND_HISTORY_ALARM as ALARM } from './alarmDefinition.js';
import { TENANT_KIND_HISTORY_QUERY_PROFILE } from './queryProfile.js';

/**
 * Builds the k8s-interop-be-tenant-kind-history-consumer-errors-prod runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    id: ALARM.runbookKey,
    metadata: {
      name: 'k8s-interop-be-tenant-kind-history-consumer-errors-prod',
      description: 'Analizza gli errori Kafka del tenant kind history consumer INTEROP e i log correlati per CID.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'kafka', 'tenant-kind-history', 'consumer'],
    },
    service: { name: ALARM.podApp, logGroup: ALARM.logGroup, varPrefix: ALARM.varPrefix },
    resolveAlarmContext: ALARM.resolveContext,
    queryProfile: TENANT_KIND_HISTORY_QUERY_PROFILE,
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 },
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      finalActions: [],
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3418358502/k8s-interop-be-tenant-kind-history-consumer-errors-prod',
          name: 'Runbook tenant kind history consumer',
          type: 'CONFLUENCE',
        },
      ],
    },
  });
}
