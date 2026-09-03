import { PUBLIC_CATALOG_ALARM } from './alarmDefinition.js';
import type { KnownCase } from '../framework.js';
import { INTEROP_DOWNSTREAMS } from '../framework.js';

import { jiraLink, slackLink } from '../common/analysisLinks.js';
import type { InteropKnownCaseRefs } from '../interop/interopKnownCases.js';
import { interopKnownCase } from '../interop/interopKnownCases.js';

const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: PUBLIC_CATALOG_ALARM.stepIds.queryApplicationLogs,
  cidTrackerStepId: PUBLIC_CATALOG_ALARM.stepIds.queryCidTracker,
  varPrefix: PUBLIC_CATALOG_ALARM.varPrefix,
};

const REACT_WARNING_SLACK_2026_07_13 = 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1783938590061959';
const REACT_WARNING_SLACK_2026_07_17 = 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1784282838257439';
const ENV_FILES_SLACK_2026_07_13 =
  'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1783939160557559?thread_ts=1783938590.061959&cid=C0A7F9XQAT0';
const ASTRO_RENDER_SLACK_2026_07_13 = 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1783954003529819';
const ASTRO_RENDER_SLACK_2026_07_14 =
  'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1784026375370299?thread_ts=1784014737.320699&cid=C0A7F9XQAT0';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopKnownCase(REFS, {
    id: 'public-catalog-invalid-uuid-syntax',
    description: 'UUID non valido nella query verso il database del public catalog',
    priority: 95,
    // Il valore dello uuid invalido varia tra le occorrenze: il pattern non lo vincola.
    regex: 'invalid input syntax for type uuid',
    resolution: 'Caso noto public catalog. Verificare riferimento PIN-8696; il valore dello uuid invalido può variare.',
    // Card PIN-8696 ancora aperta: la proposta resta IN_PROGRESS, l'evento non si chiude.
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    // Colonna "Downstream" del runbook documentale: NA su entrambe le righe censite.
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    links: [jiraLink('PIN-8696')],
  }),
  interopKnownCase(REFS, {
    id: 'public-catalog-undefined-length-type-error',
    description: "TypeError su proprietà 'length' di undefined nel public catalog frontend",
    priority: 90,
    regex: "TypeError: Cannot read properties of undefined \\(reading 'length'\\)",
    resolution: 'Caso noto public catalog. Verificare riferimento PIN-8718 (collegato a PIN-8836).',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    links: [jiraLink('PIN-8718'), jiraLink('PIN-8836')],
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
    resolution:
      'PIN-8733 descrive un caso simile sul M2M Event Cleaner, non una risoluzione per questa pod_app. ' +
      'Verificare i file .env di interop-public-catalog-astro-frontend e valutare una card specifica.',
    // PIN-8733 è DONE per un altro servizio: il caso public catalog resta da verificare.
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    links: [jiraLink('PIN-8733'), slackLink(ENV_FILES_SLACK_2026_07_13, 'Thread Slack 13/07/2026')],
  }),
  interopKnownCase(REFS, {
    id: 'public-catalog-react-list-key-warning',
    description: 'Warning React per elementi della lista senza una key univoca',
    priority: 80,
    regex: 'Each child in a list should have a unique .*key.* prop',
    resolution:
      'Probabile falso positivo: verificare nei log correlati che tra i warning sia presente la risposta ' +
      'GET /it/catalogo con Status: 200. Se la conferma manca, proseguire l’analisi. Vedere PIN-10606.',
    // Il PDF parla di "probabile" falso positivo: senza la conferma del 200 non è sicuro chiudere l'analisi.
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    links: [
      jiraLink('PIN-10606'),
      slackLink(REACT_WARNING_SLACK_2026_07_13, 'Thread Slack 13/07/2026'),
      slackLink(REACT_WARNING_SLACK_2026_07_17, 'Thread Slack 17/07/2026'),
    ],
  }),
  interopKnownCase(REFS, {
    id: 'public-catalog-failed-sql-query',
    description: 'Fallimento di una query SQL del public catalog',
    priority: 75,
    // La query SQL è variabile e può estendersi su più righe: viene riconosciuta solo la firma stabile.
    regex: 'Error: Failed query:',
    resolution:
      'Verificare se l’errore è collegato al warning React censito in PIN-10606; raccogliere query e CID ' +
      'correlati e seguire PIN-10761.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    links: [jiraLink('PIN-10761'), slackLink(REACT_WARNING_SLACK_2026_07_17, 'Thread Slack 17/07/2026')],
  }),
  interopKnownCase(REFS, {
    id: 'public-catalog-error-fetching-from-database',
    description: 'Errore di lettura dal database del public catalog',
    priority: 70,
    regex: 'Error fetching .* from the database',
    resolution:
      'Verificare riferimenti PIN-8836 e PIN-8718 (possibile duplicato). Raccogliere CID e log correlati dal trace.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    links: [jiraLink('PIN-8836'), jiraLink('PIN-8718')],
  }),
  interopKnownCase(REFS, {
    id: 'public-catalog-astro-node-could-not-render',
    description: 'Astro Node non riesce a renderizzare una risorsa del public catalog frontend',
    priority: 65,
    // Il target successivo a "Could not render" è variabile: la firma stabile termina prima del suo valore.
    regex: '\\[ERROR\\] \\[@astrojs/node\\] Could not render',
    resolution:
      'Il documento non indica una risoluzione operativa. Raccogliere il target non renderizzato, il CID e i log ' +
      'correlati; consultare i thread Slack del 13/07/2026 e 14/07/2026.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    links: [
      slackLink(ASTRO_RENDER_SLACK_2026_07_13, 'Thread Slack 13/07/2026'),
      slackLink(ASTRO_RENDER_SLACK_2026_07_14, 'Thread Slack 14/07/2026'),
    ],
  }),
];
