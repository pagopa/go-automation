/**
 * Runbook: k8s-interop-public-catalog-strapi-errors
 */

import { interop, type Runbook } from '../framework.js';
import { PUBLIC_CATALOG_STRAPI_ALARM as alarm } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';
import { STRAPI_QUERY_PROFILE } from './queryProfile.js';
import { QueryPublicCatalogStrapiContextStep } from './QueryPublicCatalogStrapiContextStep.js';

const RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3339583646/k8s-interop-public-catalog-strapi-errors-public-catalog';

/**
 * Builds the k8s-interop-public-catalog-strapi-errors runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  const contextStep = { step: new QueryPublicCatalogStrapiContextStep() };
  const runbook = interop.k8s.createInteropK8sAlarmRunbook({
    id: alarm.runbookKey,
    metadata: {
      name: alarm.runbookKey,
      description:
        'Analizza errori di rete e warning di avvio di Strapi nel catalogo pubblico INTEROP, raccogliendo anche il contesto senza CID.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'public-catalog', 'strapi'],
    },
    service: { name: alarm.podApp, logGroup: alarm.logGroup, varPrefix: alarm.varPrefix },
    resolveAlarmContext: alarm.resolveContext,
    queryProfile: STRAPI_QUERY_PROFILE,
    knownCases: KNOWN_CASES,
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 5 },
    additionalLogEvidence: [
      {
        id: 'public-catalog-strapi-context',
        label: 'Contesto di avvio e richieste HTTP Strapi',
        sourceStep: contextStep.step.id,
        // Keep startup signals before later HTTP/error rows; the query rejects 1,000 rows or more.
        maxLogLines: 1000,
      },
    ],
    analysisDefaults: {
      runbookName: alarm.runbookKey,
      links: [{ url: RUNBOOK_URL, name: alarm.runbookKey, type: 'CONFLUENCE' }],
    },
  });
  return {
    ...runbook,
    // AnalyzeCidTracker resolves cases: collect the context before that step.
    steps: runbook.steps.flatMap((descriptor) =>
      descriptor.step.id === alarm.stepIds.analyzeCidTracker ? [contextStep, descriptor] : [descriptor],
    ),
  };
}
