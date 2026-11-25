import {
  INTEROP_DOWNSTREAMS,
  interopK8sKnownCase,
  type InteropK8sKnownCaseRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownCase } from '../../../../engine/index.js';
import { PUBLIC_CATALOG_STRAPI_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropK8sKnownCaseRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopK8sKnownCase(REFS, {
    id: 'public-catalog-strapi-connection-reset',
    description: 'Connessione TCP interrotta durante una lettura di Strapi',
    // The CID tracker includes other services: only Strapi's error scan is evidence.
    environments: ['prod'],
    regex: 'Error:\\s*read ECONNRESET\\b',
    evidence: 'APPLICATION_LOGS',
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Servizio', '{{vars.interopPodApp}}'],
      ['Log di contesto', '{{vars.publicCatalogStrapiContextLogCount}}'],
    ],
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Strapi segnala Error: read ECONNRESET; causa e ripresa da verificare.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
  interopK8sKnownCase(REFS, {
    id: 'public-catalog-strapi-transfer-token-salt-warning',
    description: 'Warning di avvio Strapi: funzionalità data transfer disabilitate',
    environments: ['prod'],
    regex: 'Warning: Missing transfer\\.token\\.salt: Data transfer features have been disabled\\.',
    evidence: 'APPLICATION_LOGS',
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Servizio', '{{vars.interopPodApp}}'],
      ['Log di contesto', '{{vars.publicCatalogStrapiContextLogCount}}'],
    ],
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
  interopK8sKnownCase(REFS, {
    id: 'public-catalog-strapi-startup-stderr',
    description: 'Messaggi di avvio Corepack o baseline-browser-mapping su stderr di Strapi',
    environments: ['prod'],
    regex:
      'Corepack is about to download|\\[baseline-browser-mapping\\] The data in this module is over two months old',
    evidence: 'APPLICATION_LOGS',
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Servizio', '{{vars.interopPodApp}}'],
      ['Log di contesto', '{{vars.publicCatalogStrapiContextLogCount}}'],
    ],
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
];
