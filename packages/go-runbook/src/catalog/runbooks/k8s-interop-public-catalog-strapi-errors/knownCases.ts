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
    resolution:
      'ECONNRESET indica una connessione TCP interrotta durante una lettura; non identifica da solo il peer, ' +
      'il database o la causa. Raccogliere orari UTC da @timestamp, pod/log stream, stack trace completo e CID se presente. ' +
      'Senza CID usare il contesto Strapi stdout/stderr per pod e intervallo. Verificare riavvii, pod eviction, ' +
      'manutenzioni e disponibilità delle dipendenze solo quando correlati all’episodio. ' +
      'L’analisi Watchtower del 06/10/2026 è stata classificata come manutenzione EKS: la decisione è storica ' +
      'e richiede una conferma della finestra e della risorsa per una nuova occorrenza. ' +
      'Verificare disponibilità di Strapi e ripresa delle richieste dopo l’errore, distinguendo gli esiti HTTP. ' +
      'Un avvio completato o una risposta 200 prima dell’errore non provano il recupero successivo; ' +
      'silenzio dei log e ritorno dell’allarme a OK non bastano. Se la verifica manca mantenere aperta l’analisi; ' +
      'se l’errore persiste o il catalogo è indisponibile coinvolgere il team di prodotto Interoperabilità. ' +
      'Nessun riavvio o modifica di configurazione durante la verifica in sola lettura.',
    details: [
      ['Servizio', '{{vars.interopPodApp}}'],
      ['Log di contesto', '{{vars.publicCatalogStrapiContextLogCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Strapi segnala Error: read ECONNRESET; causa e ripresa da verificare.',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: ['Necessario confronto con il team di prodotto'],
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
    resolution:
      'Il warning segnala l’assenza di transfer.token.salt e la disabilitazione delle funzionalità data transfer. ' +
      'È stato osservato su stderr durante un avvio, ma non prova da solo un guasto del catalogo né una manutenzione. ' +
      'Verificare con il team di prodotto se tali funzionalità siano richieste e controllare disponibilità di Strapi, ' +
      'richieste successive ed eventuali errori concomitanti nel contesto completo. La presenza di ECONNRESET ' +
      'richiede la diagnosi dedicata. Registrare una manutenzione solo dopo conferma della finestra e della risorsa. ' +
      'Mantenere aperta l’analisi fino alla verifica; non generare salt, modificare segreti o configurazione dal runbook.',
    details: [
      ['Servizio', '{{vars.interopPodApp}}'],
      ['Log di contesto', '{{vars.publicCatalogStrapiContextLogCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: ['Necessario confronto con il team di prodotto'],
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
    resolution:
      'Queste firme sono messaggi informativi o warning di avvio presenti su stderr. Verificare che l’avvio ' +
      'sia completato e che Strapi serva richieste dopo l’episodio; cercare altri errori, compreso ECONNRESET, ' +
      'nel contesto dello stesso pod. Non classificare automaticamente l’intera occorrenza come falso positivo ' +
      'o manutenzione: serve la verifica di impatto, disponibilità e dell’eventuale finestra di intervento. ' +
      'Mantenere aperta l’analisi se la ripresa non è verificabile e confrontarsi con il team di prodotto. ' +
      'Non eseguire i comandi di aggiornamento suggeriti dal log durante questa analisi in sola lettura.',
    details: [
      ['Servizio', '{{vars.interopPodApp}}'],
      ['Log di contesto', '{{vars.publicCatalogStrapiContextLogCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: ['Necessario confronto con il team di prodotto'],
    },
  }),
];
