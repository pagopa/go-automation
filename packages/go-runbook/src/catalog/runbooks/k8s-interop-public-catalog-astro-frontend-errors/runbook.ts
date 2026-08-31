import { PUBLIC_CATALOG_ALARM } from './alarmDefinition.js';
import { interop } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';

export function buildK8sInteropPublicCatalogAstroFrontendErrorsRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    id: PUBLIC_CATALOG_ALARM.runbookKey,
    metadata: {
      name: PUBLIC_CATALOG_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del public catalog astro frontend leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'public-catalog'],
    },
    service: {
      name: PUBLIC_CATALOG_ALARM.podApp,
      logGroup: PUBLIC_CATALOG_ALARM.logGroup,
      varPrefix: PUBLIC_CATALOG_ALARM.varPrefix,
    },
    resolveAlarmContext: PUBLIC_CATALOG_ALARM.resolveContext,
    knownCases: KNOWN_CASES,
  });
}
