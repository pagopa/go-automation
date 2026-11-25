import { PUBLIC_CATALOG_ALARM } from './alarmDefinition.js';
import { interop } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';

import { KNOWN_CASES } from './knownCases.js';

/**
 * Builds the k8s-interop-public-catalog-astro-frontend-errors runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    alarm: PUBLIC_CATALOG_ALARM,
    metadata: {
      name: PUBLIC_CATALOG_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del public catalog astro frontend leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'public-catalog'],
    },
    knownCases: KNOWN_CASES,
  });
}
