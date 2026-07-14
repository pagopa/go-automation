import { interop } from '@go-automation/go-runbook';
import type { Runbook } from '@go-automation/go-runbook';

import { KNOWN_CASES } from './knownCases.js';
import {
  INTEROP_PUBLIC_CATALOG_RUNBOOK_KEY,
  INTEROP_PUBLIC_CATALOG_SERVICE_NAME,
  INTEROP_PUBLIC_CATALOG_STATIC_LOG_GROUP,
  INTEROP_PUBLIC_CATALOG_VAR_PREFIX,
  resolveInteropPublicCatalogAlarmContext,
} from './resolveInteropAlarmContext.js';

export function buildK8sInteropPublicCatalogAstroFrontendErrorsRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    id: INTEROP_PUBLIC_CATALOG_RUNBOOK_KEY,
    metadata: {
      name: INTEROP_PUBLIC_CATALOG_RUNBOOK_KEY,
      description:
        'Analizza gli allarmi k8s INTEROP del public catalog astro frontend leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'public-catalog'],
    },
    service: {
      name: INTEROP_PUBLIC_CATALOG_SERVICE_NAME,
      logGroup: INTEROP_PUBLIC_CATALOG_STATIC_LOG_GROUP,
      varPrefix: INTEROP_PUBLIC_CATALOG_VAR_PREFIX,
    },
    resolveAlarmContext: resolveInteropPublicCatalogAlarmContext,
    knownCases: KNOWN_CASES,
  });
}
