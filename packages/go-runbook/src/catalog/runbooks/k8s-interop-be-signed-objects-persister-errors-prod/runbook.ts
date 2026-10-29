/**
 * Runbook: k8s-interop-be-signed-objects-persister-errors-prod
 */

import { interop } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';
import { SIGNED_OBJECTS_PERSISTER_ALARM as ALARM } from './alarmDefinition.js';
import { SIGNED_OBJECTS_PERSISTER_QUERY_PROFILE } from './queryProfile.js';

/**
 * Builds the k8s-interop-be-signed-objects-persister-errors-prod runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    id: ALARM.runbookKey,
    metadata: {
      name: 'k8s-interop-be-signed-objects-persister-errors-prod',
      description: 'Analizza gli errori del signed objects persister INTEROP nei log applicativi e nei CID correlati.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'signed-objects', 'safe-storage'],
    },
    service: { name: ALARM.podApp, logGroup: ALARM.logGroup, varPrefix: ALARM.varPrefix },
    resolveAlarmContext: ALARM.resolveContext,
    queryProfile: SIGNED_OBJECTS_PERSISTER_QUERY_PROFILE,
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2468478981/k8s-interop-be-signed-objects-persister-errors-prod',
          name: 'Runbook signed objects persister',
          type: 'CONFLUENCE',
        },
      ],
    },
  });
}
