import { INTEROP_DOWNSTREAMS, knownCase, type KnownCase } from '../framework.js';
import { all } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { varEquals } from '../common/varConditions.js';
import { PUBLIC_CATALOG_STRAPI_ALARM as alarm } from './alarmDefinition.js';
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'public-catalog-strapi-connection-reset',
    description: 'Connessione TCP interrotta durante una lettura di Strapi',
    priority: 100,
    // The CID tracker includes other services: only Strapi's error scan is evidence.
    condition: all(
      varEquals('interopEnvironment', 'prod'),
      stepEvidenceMatches(alarm.stepIds.queryApplicationLogs, 'Error:\\s*read ECONNRESET\\b'),
    ),
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Servizio', '{{vars.interopPodApp}}'],
      ['Log di contesto', '{{vars.publicCatalogStrapiContextLogCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Strapi segnala Error: read ECONNRESET; causa e ripresa da verificare.',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'public-catalog-strapi-transfer-token-salt-warning',
    description: 'Warning di avvio Strapi: funzionalità data transfer disabilitate',
    priority: 70,
    condition: all(
      varEquals('interopEnvironment', 'prod'),
      stepEvidenceMatches(
        alarm.stepIds.queryApplicationLogs,
        'Warning: Missing transfer\\.token\\.salt: Data transfer features have been disabled\\.',
      ),
    ),
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Servizio', '{{vars.interopPodApp}}'],
      ['Log di contesto', '{{vars.publicCatalogStrapiContextLogCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'public-catalog-strapi-startup-stderr',
    description: 'Messaggi di avvio Corepack o baseline-browser-mapping su stderr di Strapi',
    priority: 50,
    condition: all(
      varEquals('interopEnvironment', 'prod'),
      stepEvidenceMatches(
        alarm.stepIds.queryApplicationLogs,
        'Corepack is about to download|\\[baseline-browser-mapping\\] The data in this module is over two months old',
      ),
    ),
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Servizio', '{{vars.interopPodApp}}'],
      ['Log di contesto', '{{vars.publicCatalogStrapiContextLogCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: [],
      links: [],
    },
  }),
];
