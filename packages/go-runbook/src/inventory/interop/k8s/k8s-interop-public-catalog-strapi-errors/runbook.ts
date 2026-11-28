/**
 * Runbook: k8s-interop-public-catalog-strapi-errors
 */

import { interop } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';
import { PUBLIC_CATALOG_STRAPI_ALARM as alarm } from './alarmDefinition.js';
import { KNOWN_ERRORS } from './knownErrors.js';
import { STRAPI_QUERY_PROFILE } from './queryProfile.js';
import { POD_CONTEXT } from './podContext.js';

const RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3339583646/k8s-interop-public-catalog-strapi-errors-public-catalog';

/**
 * Builds the k8s-interop-public-catalog-strapi-errors runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    alarm,
    metadata: {
      name: alarm.runbookKey,
      description:
        'Analizza errori di rete e warning di avvio di Strapi nel catalogo pubblico INTEROP, raccogliendo anche il contesto senza CID.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'public-catalog', 'strapi'],
    },
    queryProfile: STRAPI_QUERY_PROFILE,
    knownErrors: KNOWN_ERRORS,
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 5 },

    podContext: {
      step: POD_CONTEXT,
      evidenceId: 'public-catalog-strapi-context',
      evidenceLabel: 'Contesto di avvio e richieste HTTP Strapi',
    },
    analysisDefaults: {
      runbookName: alarm.runbookKey,
      links: [{ url: RUNBOOK_URL, name: alarm.runbookKey, type: 'CONFLUENCE' }],
    },
  });
}
