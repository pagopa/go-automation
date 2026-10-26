import { PUBLIC_CATALOG_ALARM } from './alarmDefinition.js';
import type { KnownCase } from '../framework.js';
import { INTEROP_DOWNSTREAMS } from '../framework.js';

import type { InteropKnownCaseRefs } from '../interop/interopKnownCases.js';
import { interopKnownCase } from '../interop/interopKnownCases.js';
const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: PUBLIC_CATALOG_ALARM.stepIds.queryApplicationLogs,
  cidTrackerStepId: PUBLIC_CATALOG_ALARM.stepIds.queryCidTracker,
  varPrefix: PUBLIC_CATALOG_ALARM.varPrefix,
};
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopKnownCase(REFS, {
    id: 'public-catalog-invalid-uuid-syntax',
    description: 'UUID non valido nella query verso il database del public catalog',
    priority: 95,
    // Il valore dello uuid invalido varia tra le occorrenze: il pattern non lo vincola.
    regex: 'invalid input syntax for type uuid',
    resolution: 'PIN-8696',
    // Card PIN-8696 ancora aperta: la proposta resta IN_PROGRESS, l'evento non si chiude.
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    // Colonna "Downstream" del runbook documentale: NA su entrambe le righe censite.
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-8696', name: 'PIN-8696', type: 'JIRA' }],
    finalActions: [],
  }),
  interopKnownCase(REFS, {
    id: 'public-catalog-undefined-length-type-error',
    description: "TypeError su proprietà 'length' di undefined nel public catalog frontend",
    priority: 90,
    regex: "TypeError: Cannot read properties of undefined \\(reading 'length'\\)",
    resolution: 'PIN-8718 PIN-8836',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    links: [
      { url: 'https://pagopa.atlassian.net/browse/PIN-8718', name: 'PIN-8718', type: 'JIRA' },
      { url: 'https://pagopa.atlassian.net/browse/PIN-8836', name: 'PIN-8836', type: 'JIRA' },
    ],
    finalActions: [],
  }),
  interopKnownCase(REFS, {
    id: 'public-catalog-astro-frontend-missing-env-files',
    description: 'Caricamento dei file .env fallito nel package astro-frontend',
    priority: 85,
    // Messaggio reale:
    // [dotenv-flow@4.1.0]: \".env*\" files loading failed: no \".env*\" files matching pattern \".env[.node_env][.local]\" in \"/app/packages/astro-frontend\" dir undefined
    // Le virgolette arrivano già escapate nei log e vengono escapate di nuovo dal confronto
    // JSON-stringificato: il pattern usa wildcard al loro posto e la versione non è vincolata.
    regex: '\\[dotenv-flow@[^\\]]+\\]: .*\\.env\\*.* files loading failed: no .*\\.env\\*.* files matching pattern',
    resolution: 'PIN-10957',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-10957', name: 'PIN-10957', type: 'JIRA' }],
    finalActions: [],
  }),
  interopKnownCase(REFS, {
    id: 'public-catalog-react-list-key-warning',
    description: 'Warning React per elementi della lista senza una key univoca',
    priority: 80,
    regex: 'Each child in a list should have a unique .*key.* prop',
    resolution: 'PIN-10606',
    // Il PDF parla di "probabile" falso positivo: senza la conferma del 200 non è sicuro chiudere l'analisi.
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    links: [
      { url: 'https://pagopa.atlassian.net/browse/PIN-10606', name: 'PIN-10606', type: 'JIRA' },
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1783938590061959',
        name: 'Thread Slack 13/07/2026',
        type: 'SLACK',
      },
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1784282838257439',
        name: 'Thread Slack 17/07/2026',
        type: 'SLACK',
      },
    ],
    finalActions: [],
  }),
  interopKnownCase(REFS, {
    id: 'public-catalog-failed-sql-query',
    description: 'Fallimento di una query SQL del public catalog',
    priority: 75,
    // La query SQL è variabile e può estendersi su più righe: viene riconosciuta solo la firma stabile.
    regex: 'Error: Failed query:',
    resolution: 'PIN-10761',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    links: [
      { url: 'https://pagopa.atlassian.net/browse/PIN-10761', name: 'PIN-10761', type: 'JIRA' },
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1784282838257439',
        name: 'Thread Slack 17/07/2026',
        type: 'SLACK',
      },
    ],
    finalActions: [],
  }),
  interopKnownCase(REFS, {
    id: 'public-catalog-error-fetching-from-database',
    description: 'Errore di lettura dal database del public catalog',
    priority: 70,
    regex: 'Error fetching .* from the database',
    resolution: 'PIN-8718 PIN-8836',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    links: [
      { url: 'https://pagopa.atlassian.net/browse/PIN-8836', name: 'PIN-8836', type: 'JIRA' },
      { url: 'https://pagopa.atlassian.net/browse/PIN-8718', name: 'PIN-8718', type: 'JIRA' },
    ],
    finalActions: [],
  }),
  interopKnownCase(REFS, {
    id: 'public-catalog-astro-node-could-not-render',
    description: 'Astro Node non riesce a renderizzare una risorsa del public catalog frontend',
    priority: 65,
    // Il target successivo a "Could not render" è variabile: la firma stabile termina prima del suo valore.
    regex: '\\[ERROR\\] \\[@astrojs/node\\] Could not render',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    links: [
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1783954003529819',
        name: 'Thread Slack 13/07/2026',
        type: 'SLACK',
      },
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1784026375370299?thread_ts=1784014737.320699&cid=C0A7F9XQAT0',
        name: 'Thread Slack 14/07/2026',
        type: 'SLACK',
      },
    ],
    finalActions: [],
  }),
];
